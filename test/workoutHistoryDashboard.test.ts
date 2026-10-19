import "mocha";
import { expect } from "chai";
import { Settings_build } from "../src/models/settings";
import { IHistoryRecord, IHistoryEntry, ISet } from "../src/types";
import {
  WorkoutHistory_summarize, WorkoutHistory_trend, WorkoutHistory_totals,
} from "../src/models/workoutHistoryDashboard";
import { Weight_build } from "../src/models/weight";

function set(id: string, reps: number, weight: number, completed = true): ISet {
  return {
    vtype: "set", id, index: 0, reps, completedReps: completed ? reps : undefined,
    isCompleted: completed, weight: Weight_build(weight, "kg"),
    completedWeight: completed ? Weight_build(weight, "kg") : undefined,
  };
}

function entry(id: string, exerciseId: string, sets: ISet[], warmupSets: ISet[] = []): IHistoryEntry {
  return { vtype: "history_entry", id, index: 0, exercise: { id: exerciseId, equipment: "barbell" }, sets, warmupSets };
}

function record(date: string, name: string, entries: IHistoryEntry[], durationMinutes = 50): IHistoryRecord {
  const stamp = Date.parse(date + "T10:00:00Z");
  return {
    vtype: "history_record",
    id: stamp, date: new Date(stamp).toISOString(), startTime: stamp,
    endTime: stamp + durationMinutes * 60000,
    programId: "training", programName: "Strength",
    day: 1, dayName: name, entries,
  };
}

describe("Workout history dashboard", () => {
  const settings = Settings_build();
  const first = record("2026-07-14", "A", [
    entry("squat", "squat", [set("s1", 5, 100), set("s2", 3, 100, false)], [set("w1", 5, 60)]),
    entry("deadlift", "deadlift", [set("s3", 3, 130)]),
  ], 30);
  const second = record("2026-07-16", "B", [
    entry("squat", "squat", [set("s4", 5, 110)]),
  ], 60);

  it("counts only completed working sets and never includes warmups", () => {
    const summaries = WorkoutHistory_summarize([second, first], settings);
    expect(summaries.map((s) => s.sets)).to.deep.equal([2, 1]);
    expect(summaries.map((s) => s.reps)).to.deep.equal([8, 5]);
    expect(summaries.map((s) => s.minutes)).to.deep.equal([30, 60]);
    expect(WorkoutHistory_totals(summaries).workouts).to.equal(2);
  });

  it("filters by exercise without losing the full session's duration", () => {
    const squatOnly = WorkoutHistory_summarize([first, second], settings, { exerciseKey: "squat_barbell" });
    expect(squatOnly).to.have.length(2);
    expect(squatOnly[0].sets).to.equal(1);
    expect(squatOnly[0].reps).to.equal(5);
    expect(squatOnly[0].minutes).to.equal(30);
  });

  it("excludes dates outside the chosen period measured from newest workout", () => {
    const old = record("2025-01-10", "Older", [entry("squat", "squat", [set("s5", 5, 80)])]);
    const r = WorkoutHistory_summarize([old, first, second], settings, { days: 90 });
    expect(r).to.have.length(2);
  });

  it("groups workouts into ISO Monday weeks and calendar months", () => {
    const summaries = WorkoutHistory_summarize([first, second], settings);
    const weekly = WorkoutHistory_trend(summaries, "sets", "week");
    expect(weekly).to.deep.equal([[Date.parse("2026-07-13T00:00:00Z") / 1000, 3]]);
    const monthly = WorkoutHistory_trend(summaries, "workouts", "month");
    expect(monthly).to.deep.equal([[Date.parse("2026-07-01T00:00:00Z") / 1000, 2]]);
  });

  it("uses all workouts, including imported ones, with no external API dependency", () => {
    const imported = { ...first, programName: "MacroFactor Workouts", source: "macrofactor-workouts" };
    const summaries = WorkoutHistory_summarize([imported, second], settings);
    expect(summaries).to.have.length(2);
    expect(summaries[0].program).to.equal("MacroFactor Workouts");
  });

  it("ignores ongoing records, preserving past history only", () => {
    const ongoing = { ...second, id: 123, vtype: "progress" as const };
    expect(WorkoutHistory_summarize([first, ongoing], settings)).to.have.length(1);
  });
});
