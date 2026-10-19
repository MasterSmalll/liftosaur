import "mocha";
import { expect } from "chai";
import { IHistoryRecord, IHistoryEntry, ISet, IStats } from "../src/types";
import { Settings_build } from "../src/models/settings";
import { Weight_build } from "../src/models/weight";
import {
  Bodyweight_parseMacroFactorTrend,
  Bodyweight_contributionForWorkout,
  Bodyweight_equivalentResistance,
  Bodyweight_forWorkout,
  Bodyweight_performance,
  Bodyweight_bestSessionSets,
} from "../src/models/bodyweightPerformance";

function stats(): IStats {
  return {
    weight: {
      weight: [{
        vtype: "stat",
        timestamp: Date.parse("2026-07-14T06:30:00Z"),
        value: Weight_build(85, "kg"),
      }],
    },
    length: {},
    percentage: {},
    bodyweightTrend: [
      { date: "2026-07-14", kg: 84.8, source: "macrofactor" },
      { date: "2026-07-16", kg: 84.6, source: "macrofactor" },
    ],
  };
}
function exerciseEntry(_name: string, id: string, extraKg: number): IHistoryEntry {
  const set: ISet = {
    vtype: "set", id: "working-1", index: 0, completedReps: 5, reps: 5,
    completedWeight: Weight_build(extraKg, "kg"), isCompleted: true,
  };
  return {
    vtype: "history_entry", id: "ex1", index: 0,
    exercise: { id, equipment: "bodyweight" },
    sets: [set], warmupSets: [],
  };
}
function workout(date: string, entry: IHistoryEntry, source = "macrofactor-workouts"): IHistoryRecord {
  const startTime = Date.parse(date + "T12:00:00Z");
  return {
    vtype: "history_record", id: startTime, date: date + "T12:00:00Z",
    startTime, programId: "test", programName: "Synthetic", day: 1, dayName: "Pull",
    entries: [entry], source,
  };
}
describe("Bodyweight performance (no double counting)", () => {
  it("prefers a true scale measurement over the estimated trend on the same calendar day", () => {
    const result = Bodyweight_forWorkout("2026-07-14", stats(), { timeZone: "Europe/Paris" });
    expect(result.status).to.equal("measured");
    expect(result.status === "unknown" ? null : result.kg).to.equal(85);
  });
  it("uses the MacroFactor trend only where a real measurement is absent", () => {
    const result = Bodyweight_forWorkout("2026-07-16", stats(), { timeZone: "Europe/Paris" });
    expect(result).to.deep.equal({ status: "estimated", date: "2026-07-16", kg: 84.6, source: "macrofactor" });
  });
  it("never interpolates or fabricates a missing day's bodyweight", () => {
    expect(Bodyweight_forWorkout("2026-07-15", stats(), { timeZone: "Europe/Paris" }).status).to.equal("unknown");
  });
  it("calculates imported pull-up ballast exactly once", () => {
    const p = Bodyweight_performance([workout("2026-07-16", exerciseEntry("Pull Up", "pullUp", 20))],
      stats(), Settings_build(), { timeZone: "Europe/Paris" });
    expect(p).to.have.length(1);
    expect(p[0].externalKg).to.equal(20);
    expect(p[0].totalKg).to.equal(104.6);
    expect(p[0].bodyweight.status).to.equal("estimated");
  });
  it("does not add bodyweight to native lifts with unknown weight conventions", () => {
    const record = workout("2026-07-16", exerciseEntry("Pull Up", "pullUp", 100), "native");
    const p = Bodyweight_performance([record], stats(), Settings_build(), { timeZone: "Europe/Paris" });
    expect(p[0].externalKg).to.equal(100);
    expect(p[0].totalKg).to.equal(undefined);
    expect(p[0].loadSemantics).to.equal("unverified");
  });
  it("excludes kipping and assisted pulls from normal strength-comparison graphs", () => {
    const e = exerciseEntry("Pull Up", "kippingPullUp", 0);
    const p = Bodyweight_performance([workout("2026-07-16", e)], stats(), Settings_build());
    expect(p).to.have.length(0);
  });
  it("keeps three physically distinct measures without assuming a percentage", () => {
    const record = workout("2026-07-14", exerciseEntry("Pull Up", "pullUp", 20));
    const result = Bodyweight_performance([record], stats(), Settings_build(), { timeZone: "Europe/Paris" });
    expect(result).to.have.length(1);
    expect(result[0].externalKg).to.equal(20);
    expect(result[0].totalKg).to.equal(105); // full static support
    expect(result[0].equivalentKg).to.equal(undefined); // no percentage verified
    expect(result[0].contribution).to.equal(undefined);
  });

  it("uses a dated, cited 95% coefficient to derive 100.75 kg from 85 kg + 20 kg", () => {
    const settings = Settings_build();
    settings.exerciseData["pullUp_bodyweight"] = {
      bodyweightContributions: [{
        effectiveFrom: "2026-01-01", fraction: 0.95,
        provenance: "user-estimate", reference: "Illustrative coefficient, not an official default",
      }],
    };
    const result = Bodyweight_performance(
      [workout("2026-07-14", exerciseEntry("Pull Up", "pullUp", 20))],
      stats(), settings, { timeZone: "Europe/Paris" }
    )[0];
    expect(result.externalKg).to.equal(20);
    expect(result.totalKg).to.equal(105);
    expect(result.equivalentKg).to.equal(100.75);
    expect(result.contribution?.fraction).to.equal(0.95);
    expect(result.contribution?.provenance).to.equal("user-estimate");
  });

  it("supports 0/60/92/95/100 percent without confusing static load and resistance", () => {
    for (const [pct, expected] of [[0, 20], [0.60, 71], [0.92, 98.2], [0.95, 100.75], [1, 105]]) {
      const result = Bodyweight_equivalentResistance(20, 85, pct);
      expect(result).to.be.closeTo(expected, 1e-8);
    }
    expect(Bodyweight_equivalentResistance(20, 85, -0.1)).to.equal(undefined);
    expect(Bodyweight_equivalentResistance(20, 85, 1.1)).to.equal(undefined);
    expect(Bodyweight_equivalentResistance(20, 85, Number.NaN)).to.equal(undefined);
    expect(Bodyweight_equivalentResistance(20, 0, 0.95)).to.equal(undefined);
    expect(Bodyweight_equivalentResistance(-20, 85, 0.95)).to.equal(undefined);
  });

  it("uses revision valid at workout date, without rewriting historical results", () => {
    const settings = Settings_build();
    settings.exerciseData["pullUp_bodyweight"] = {
      bodyweightContributions: [
        { effectiveFrom: "2026-07-17", fraction: 1, provenance: "user-estimate" },
        { effectiveFrom: "2026-01-01", fraction: 0.95, provenance: "study-based-estimate" },
      ],
    };
    expect(Bodyweight_contributionForWorkout("pullUp_bodyweight", "2026-07-14", settings)?.fraction).to.equal(0.95);
    expect(Bodyweight_contributionForWorkout("pullUp_bodyweight", "2026-07-19", settings)?.fraction).to.equal(1);
    expect(Bodyweight_contributionForWorkout("pullUp_bodyweight", "2025-12-31", settings)).to.equal(undefined);
    expect(Bodyweight_contributionForWorkout("tricepsDip_bodyweight", "2026-07-19", settings)).to.equal(undefined);
    expect(Bodyweight_contributionForWorkout("pullUp_bodyweight", "not-a-date", settings)).to.equal(undefined);
  });

  it("does not normalize native unknown conventions even if percentage is set", () => {
    const settings = Settings_build();
    settings.exerciseData["pullUp_bodyweight"] = {
      bodyweightContributions: [{ effectiveFrom: "2026-01-01", fraction: 0.95,
        provenance: "user-confirmed-macrofactor" }],
    };
    const record = workout("2026-07-14", exerciseEntry("Pull Up", "pullUp", 100), "native");
    const result = Bodyweight_performance([record], stats(), settings, { timeZone: "Europe/Paris" })[0];
    expect(result.externalKg).to.equal(100); // recorded, but convention not established
    expect(result.loadSemantics).to.equal("unverified");
    expect(result.totalKg).to.equal(undefined);
    expect(result.equivalentKg).to.equal(undefined);
  });

  it("requires actual or explicitly estimated same-day bodyweight for derived values", () => {
    const settings = Settings_build();
    settings.exerciseData["pullUp_bodyweight"] = {
      bodyweightContributions: [{ effectiveFrom: "2026-01-01", fraction: 0.95, provenance: "user-estimate" }],
    };
    const missing = Bodyweight_performance(
      [workout("2026-07-15", exerciseEntry("Pull Up", "pullUp", 20))],
      stats(), settings, { timeZone: "Europe/Paris" }
    )[0];
    expect(missing.bodyweight.status).to.equal("unknown");
    expect(missing.totalKg).to.equal(undefined);
    expect(missing.equivalentKg).to.equal(undefined);
  });

  it("parses real MacroFactor trend column without pretending those points are measurements", () => {
    const data = "Date,Trend Weight (kg)\n2026-07-14 00:00:00,88.2\n2026-07-16 00:00:00,87.9";
    expect(Bodyweight_parseMacroFactorTrend(data)).to.deep.equal([
      { date: "2026-07-14", kg: 88.2, source: "macrofactor" },
      { date: "2026-07-16", kg: 87.9, source: "macrofactor" },
    ]);
  });
  it("rejects duplicate dates, invalid weights, and unrelated nutrition CSV", () => {
    expect(() => Bodyweight_parseMacroFactorTrend("Date,Calories\n2026-07-16,100")).to.throw();
    expect(() => Bodyweight_parseMacroFactorTrend("Date,Trend Weight (kg)\n2026-07-16,70\n2026-07-16,70")).to.throw();
    expect(() => Bodyweight_parseMacroFactorTrend("Date,Trend Weight (kg)\n2026-07-16,-1")).to.throw();
  });
  it("keeps the heaviest working set per workout for plotting", () => {
    const first = workout("2026-07-16", exerciseEntry("Pull Up", "pullUp", 20));
    const p = Bodyweight_performance([first], stats(), Settings_build());
    expect(Bodyweight_bestSessionSets(p, "pullUp_bodyweight").length).to.equal(1);
  });
});
