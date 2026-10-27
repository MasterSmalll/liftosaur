import { IHistoryEntry, IHistoryRecord, ISettings } from "../types";
import { Exercise_toKey } from "./exercise";
import { History_totalEntryWeight, History_workoutTime } from "./history";

export type IWorkoutHistoryMeasure = "workouts" | "sets" | "reps" | "minutes" | "volume";
export type IWorkoutHistoryGrouping = "workout" | "week" | "month";

export interface IWorkoutHistorySummary {
  id: number;
  timestamp: number;
  date: string;
  name: string;
  program: string;
  workouts: number;
  sets: number;
  reps: number;
  minutes: number;
  volume: number;
  exercises: number;
  // Raw record is retained only for read-only drill-downs.
  entries: IHistoryEntry[];
}

export interface IWorkoutHistoryFilters {
  exerciseKey?: string;
  program?: string;
  days?: number;
}

/**
 * All numbers come from completed workout history. We deliberately skip warmup sets,
 * as Liftosaur's own history volume/sets statistics do.
 * Volume follows Liftosaur's standard calculation, including its exercise multipliers.
 * It is NOT guaranteed to include bodyweight for a calisthenics exercise.
 */
export function WorkoutHistory_summarize(
  history: IHistoryRecord[],
  settings: ISettings,
  filters: IWorkoutHistoryFilters = {}
): IWorkoutHistorySummary[] {
  const completed = history.filter((r) => r.vtype === "history_record");
  const newest = completed.reduce((max, r) => Math.max(max, r.startTime), 0);
  const minTime = filters.days == null ? -Infinity : newest - filters.days * 86400000;

  return completed
    .filter((record) =>
      record.startTime >= minTime && (filters.program == null || record.programName === filters.program)
    )
    .map((record) => {
      const entries = record.entries.filter(
        (entry) => filters.exerciseKey == null || Exercise_toKey(entry.exercise) === filters.exerciseKey
      );
      const sets = entries.reduce(
        (sum, entry) => sum + entry.sets.filter((set) =>
          set.isCompleted === true || (set.completedReps != null && set.completedReps > 0) ||
          set.completedSetTimer != null
        ).length,
        0
      );
      const reps = entries.reduce(
        (sum, entry) => sum + entry.sets.reduce((total, set) => total + (set.completedReps ?? 0), 0),
        0
      );
      const volume = entries.reduce((sum, entry) => sum + History_totalEntryWeight(entry, settings).value, 0);
      const durationKnown = record.endTime != null ||
        (record.intervals != null && record.intervals.length > 0 && record.intervals.every((i) => i[1] != null));
      const ms = durationKnown ? History_workoutTime(record) : 0;
      return {
        id: record.id,
        timestamp: record.startTime,
        date: record.date.slice(0, 10),
        name: record.dayName || "Workout",
        program: record.programName || "Unassigned",
        workouts: 1,
        sets, reps, volume,
        minutes: ms / 60000,
        exercises: entries.length,
        entries,
      };
    })
    .filter((record) => filters.exerciseKey == null || record.exercises > 0)
    .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
}

function weekStartUTC(date: string): number {
  const base = new Date(date.slice(0, 10) + "T00:00:00Z");
  const mondayIndex = (base.getUTCDay() + 6) % 7;
  base.setUTCDate(base.getUTCDate() - mondayIndex);
  return base.getTime() / 1000;
}

function monthStartUTC(date: string): number {
  return Date.parse(date.slice(0, 7) + "-01T00:00:00Z") / 1000;
}

export function WorkoutHistory_trend(
  summaries: IWorkoutHistorySummary[],
  measure: IWorkoutHistoryMeasure,
  grouping: IWorkoutHistoryGrouping
): [number, number][] {
  const values = new Map<number, number>();
  for (const summary of summaries) {
    const timestamp = grouping === "week" ? weekStartUTC(summary.date)
      : grouping === "month" ? monthStartUTC(summary.date)
      : summary.timestamp / 1000;
    values.set(timestamp, (values.get(timestamp) ?? 0) + summary[measure]);
  }
  return Array.from(values, ([timestamp, value]) => [timestamp, value] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

export function WorkoutHistory_totals(summaries: IWorkoutHistorySummary[]): {
  workouts: number; sets: number; reps: number; minutes: number; volume: number;
} {
  return summaries.reduce(
    (sum, s) => ({
      workouts: sum.workouts + s.workouts,
      sets: sum.sets + s.sets,
      reps: sum.reps + s.reps,
      minutes: sum.minutes + s.minutes,
      volume: sum.volume + s.volume,
    }),
    { workouts: 0, sets: 0, reps: 0, minutes: 0, volume: 0 }
  );
}
