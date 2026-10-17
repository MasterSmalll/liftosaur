import "mocha";
import { expect } from "chai";
import {
  CustomMetrics_definitions,
  CustomMetrics_updateSet,
  CustomMetrics_numericSeries,
  CustomMetrics_validate,
} from "../src/models/customMetrics";
import { ICustomMetricDefinition, IHistoryRecord, ISet } from "../src/types";

const set = (reps = 3): ISet => ({
  vtype: "set",
  index: 0,
  id: "s1",
  reps,
  completedReps: reps,
  isCompleted: true,
});
const rir: ICustomMetricDefinition = { id: "rir", name: "RIR", scope: "set", kind: "number", min: 0, max: 10 };
const record = (startTime: number, sets: ISet[]): IHistoryRecord => ({
  vtype: "history_record",
  date: new Date(startTime).toISOString(),
  programId: "test",
  programName: "Test",
  day: 1,
  dayName: "Pull",
  entries: [{
    vtype: "history_entry",
    index: 0,
    id: "e1",
    exercise: { id: "pullUp" },
    sets,
    warmupSets: [],
  }],
  startTime,
  id: startTime,
});

describe("Custom metrics", () => {
  it("includes native RIR and allows overriding or disabling it", () => {
    expect(CustomMetrics_definitions({}).map((d) => d.id)).to.deep.equal(["rir"]);
    expect(CustomMetrics_definitions({ customMetricDefinitions: [{ ...rir, disabled: true }] })).to.deep.equal([]);
  });

  it("preserves reported RPE when RIR is entered", () => {
    const result = CustomMetrics_updateSet({ ...set(), completedRpe: 8.5 }, rir, 3);
    expect(result.customMetrics?.rir).to.equal(3);
    expect(result.completedRpe).to.equal(8.5);
  });

  it("derives RPE only when absent or previously derived", () => {
    const first = CustomMetrics_updateSet(set(), rir, 3);
    expect(first.completedRpe).to.equal(7);
    const second = CustomMetrics_updateSet(first, rir, 2);
    expect(second.completedRpe).to.equal(8);
    expect(CustomMetrics_updateSet(second, rir, undefined).completedRpe).to.equal(undefined);
  });

  it("validates units and value bounds without erasing valid data", () => {
    expect(CustomMetrics_validate(rir, 11)).to.equal(false);
    expect(CustomMetrics_validate(rir, Number.NaN)).to.equal(false);
    expect(CustomMetrics_updateSet(CustomMetrics_updateSet(set(), rir, 2), rir, 11).customMetrics?.rir).to.equal(2);
  });

  it("provides chronological workout-averaged RIR points", () => {
    const first = CustomMetrics_updateSet(set(), rir, 3);
    const second = CustomMetrics_updateSet(set(), rir, 1);
    const points = CustomMetrics_numericSeries([record(2000, [second]), record(1000, [first])], rir);
    expect(points).to.deep.equal([[1, 3], [2, 1]]);
  });

  it("supports numeric metrics on entire workouts", () => {
    const duration = { id: "sleep", name: "Sleep", scope: "workout" as const, kind: "number" as const, unit: "h" };
    const entry = { ...record(1000, []), customMetrics: { sleep: 8 } };
    expect(CustomMetrics_numericSeries([entry], duration)).to.deep.equal([[1, 8]]);
  });
});
