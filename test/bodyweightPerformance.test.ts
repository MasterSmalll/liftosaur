import "mocha";
import { expect } from "chai";
import { IHistoryRecord, IHistoryEntry, ISet, IStats } from "../src/types";
import { Settings_build } from "../src/models/settings";
import { Weight_build } from "../src/models/weight";
import {
  Bodyweight_parseMacroFactorTrend,
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
function exerciseEntry(name: string, id: string, extraKg: number): IHistoryEntry {
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
