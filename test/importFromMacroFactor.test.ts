import "mocha";
import { expect } from "chai";
import { ImportFromMacroFactor_convertCsvToHistoryRecords } from "../src/utils/importFromMacroFactor";
import { ImportFileError } from "../src/utils/importTypes";
import { Settings_build } from "../src/models/settings";

const HEADER = [
  "", "Date", "Workout Duration", "Workout", "Exercise", "Exercise Base Weight (kg)",
  "Set Type", "Weight (kg)", "Reps", "RIR", "Duration", "Distance short (m)", "Distance long (km)",
].join(",");

function row(
  index: number,
  exercise: string,
  setType = "Standard Set",
  weight = "20",
  reps = "5",
  rir = "",
  date = "2026-06-02 00:00:00"
): string {
  // These are synthetic fixtures, NOT any user's workout export.
  return [index, date, "2100", "Synthetic Training", exercise, "0", setType,
    weight, reps, rir, "", "", ""].join(",");
}

function parse(...rows: string[]) {
  return ImportFromMacroFactor_convertCsvToHistoryRecords([HEADER, ...rows].join("\n"), Settings_build());
}

describe("MacroFactor Workouts granular CSV import", () => {
  it("maps weighted pull-ups to native bodyweight Pull Up with external load only", () => {
    const r = parse(row(0, "Overhand Grip Weighted Pull-Up", "Warm-Up Set", "0", "3"),
      row(1, "Overhand Grip Weighted Pull-Up", "Standard Set", "25", "5"));
    expect(r.errors).to.deep.equal([]);
    expect(r.historyRecords).to.have.length(1);
    const e = r.historyRecords[0].entries[0];
    expect(e.exercise).to.deep.equal({ id: "pullUp", equipment: "bodyweight" });
    expect(e.warmupSets).to.have.length(1);
    expect(e.sets[0].weight?.value).to.equal(25);
    expect(e.sets[0].completedWeight?.value).to.equal(25);
    expect(e.sets[0].customMetrics).to.equal(undefined);
  });

  it("persists RIR numerically and derives RPE with provenance when provided", () => {
    const e = parse(row(0, "Barbell Back Squat", "Standard Set", "100", "5", "2")).historyRecords[0].entries[0];
    expect(e.exercise.id).to.equal("squat");
    expect(e.sets[0].customMetrics?.rir).to.equal(2);
    expect(e.sets[0].completedRpe).to.equal(8);
    expect(e.sets[0].rpeDerivedFromRir).to.equal(true);
  });

  it("keeps superset groups, distinct exercises, and every source row", () => {
    const r = parse(
      row(0, "Conventional Deadlift ∈ SS1", "Standard Set", "130", "5"),
      row(1, "Overhand Grip Weighted Pull-Up ∈ SS1", "Standard Set", "20", "5"),
      row(2, "Conventional Deadlift ∈ SS1", "Standard Set", "130", "5")
    );
    const entries = r.historyRecords[0].entries;
    expect(entries).to.have.length(2);
    expect(entries.every((e) => e.superset === "SS1")).to.equal(true);
    expect(entries[0].sets).to.have.length(2);
  });

  it("does not invent reps, dates, bodyweight or exact clock times", () => {
    const r = parse(row(0, "Kipping Pull-Up", "Standard Set", "", "6"));
    const hist = r.historyRecords[0];
    const set = hist.entries[0].sets[0];
    expect(set.weight).to.equal(undefined);
    expect(set.reps).to.equal(6);
    expect(hist.startTime).to.equal(Date.UTC(2026, 5, 2));
    expect(hist.endTime! - hist.startTime).to.equal(2100 * 1000);
    expect(hist.notes).to.include("no exact start time");
  });

  it("uses deterministic ids so a repeated import can be deduplicated", () => {
    const raw = [row(0, "Barbell Back Squat", "Standard Set", "80", "5")];
    const first = parse(...raw);
    const second = parse(...raw);
    expect(first.historyRecords[0].id).to.equal(second.historyRecords[0].id);
    expect(first.historyRecords[0].entries[0].sets[0].id).to.equal(second.historyRecords[0].entries[0].sets[0].id);
  });

  it("warns about 15+ identical sets without discarding them", () => {
    const rows = Array.from({ length: 17 }, (_, i) => row(i, "Kipping Pull-Up", "Standard Set", "", "6"));
    const r = parse(...rows);
    expect(r.historyRecords[0].entries[0].sets).to.have.length(17);
    expect(r.warnings.some((w) => w.message.includes("17 identical sets"))).to.equal(true);
  });

  it("keeps ambiguous weighted dips as distinct custom exercises", () => {
    const r = parse(row(0, "Weighted Dip", "Standard Set", "20", "5"));
    expect(Object.values(r.customExercises)).to.have.length(1);
    expect(r.historyRecords[0].entries[0].exercise.id).to.equal("macrofactor-weighted-dip");
  });

  it("does not parse nutrition sheets or invalid RIRs", () => {
    expect(() => ImportFromMacroFactor_convertCsvToHistoryRecords("Date,Weight (kg)\n2026-06-02,85", Settings_build())).to.throw(ImportFileError);
    expect(() => parse(row(0, "Barbell Back Squat", "Standard Set", "90", "5", "11"))).to.throw(ImportFileError);
  });
});
