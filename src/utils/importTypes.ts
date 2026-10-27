import { ICustomExercise, IHistoryRecord, ISet, IWeight } from "../types";

export interface IImportRowError {
  row: number;
  column?: string;
  value?: string;
  message: string;
}

export interface IImportResult {
  historyRecords: IHistoryRecord[];
  customExercises: Record<string, ICustomExercise>;
  errors: IImportRowError[];
  warnings: IImportRowError[];
}

export class ImportFileError extends Error {}

export function ImportUtils_customExercisesForRecords(
  records: IHistoryRecord[],
  customExercises: Record<string, ICustomExercise>
): Record<string, ICustomExercise> {
  const referencedIds = new Set<string>();
  for (const record of records) {
    for (const entry of record.entries) {
      referencedIds.add(entry.exercise.id);
    }
  }
  const result: Record<string, ICustomExercise> = {};
  for (const id of Object.keys(customExercises)) {
    if (referencedIds.has(id)) {
      result[id] = customExercises[id];
    }
  }
  return result;
}

const hevySignatureHeaders = ["start_time", "exercise_title", "set_type"];
const liftosaurSignatureHeaders = ["workout datetime", "exercise", "is warmup set?"];

export function ImportUtils_detectCsvKind(headers: string[]): "hevy" | "liftosaur" | "unknown" {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  if (hevySignatureHeaders.every((h) => normalized.includes(h))) {
    return "hevy";
  }
  if (liftosaurSignatureHeaders.every((h) => normalized.includes(h))) {
    return "liftosaur";
  }
  return "unknown";
}

const maxWeightLb = 3000;
const maxReps = 1000;
const minTimestamp = Date.UTC(2000, 0, 1);

export function ImportUtils_isSuspiciousWeight(value: number, unit: "kg" | "lb"): boolean {
  const lb = unit === "kg" ? value * 2.2046 : value;
  return lb < 0 || lb > maxWeightLb;
}

export function ImportUtils_isSuspiciousReps(value: number): boolean {
  return value < 0 || value > maxReps;
}

export function ImportUtils_isSuspiciousTimestamp(ts: number): boolean {
  return ts < minTimestamp || ts > Date.now() + 24 * 60 * 60 * 1000;
}

export interface IImportSummary {
  workoutCount: number;
  minStartTime?: number;
  maxStartTime?: number;
  customExerciseNames: string[];
  duplicateIds: Set<number>;
  // A matching MacroFactor source ID with different recorded values must never be overwritten implicitly.
  conflictIds: Set<number>;
}

export function ImportUtils_summarize(result: IImportResult, existingHistory: IHistoryRecord[]): IImportSummary {
  let minStartTime: number | undefined;
  let maxStartTime: number | undefined;
  for (const record of result.historyRecords) {
    if (minStartTime == null || record.startTime < minStartTime) {
      minStartTime = record.startTime;
    }
    if (maxStartTime == null || record.startTime > maxStartTime) {
      maxStartTime = record.startTime;
    }
  }
  return {
    workoutCount: result.historyRecords.length,
    minStartTime,
    maxStartTime,
    customExerciseNames: Object.values(result.customExercises)
      .map((e) => e.name)
      .sort(),
    duplicateIds: ImportUtils_findDuplicates(result.historyRecords, existingHistory),
    conflictIds: ImportUtils_findMacroFactorConflicts(result.historyRecords, existingHistory),
  };
}

const duplicateToleranceMs = 60 * 1000;

// Compare the imported workout's actual data, not only exercise names and set counts.
// MacroFactor's export provides calendar dates but no clock times; unrelated workouts
// with the same display name and number of sets must not be silently discarded.
function sameWeight(a: IWeight | undefined, b: IWeight | undefined): boolean {
  return a?.value === b?.value && a?.unit === b?.unit;
}

function sameMacroFactorSet(a: ISet, b: ISet): boolean {
  return (a.completedReps ?? a.reps) === (b.completedReps ?? b.reps) &&
    sameWeight(a.completedWeight ?? a.weight, b.completedWeight ?? b.weight) &&
    a.completedSetTimer === b.completedSetTimer &&
    a.customMetrics?.rir === b.customMetrics?.rir;
}

function sameMacroFactorRecord(a: IHistoryRecord, b: IHistoryRecord): boolean {
  if (a.source !== "macrofactor-workouts" || b.source !== "macrofactor-workouts") return false;
  const duration = (r: IHistoryRecord): number | undefined =>
    r.endTime == null ? undefined : r.endTime - r.startTime;
  return a.date.slice(0, 10) === b.date.slice(0, 10) &&
    a.dayName === b.dayName &&
    duration(a) === duration(b) &&
    a.entries.length === b.entries.length &&
    a.entries.every((entry, i) => {
      const existing = b.entries[i];
      return existing != null &&
        entry.exercise.id === existing.exercise.id &&
        entry.exercise.equipment === existing.exercise.equipment &&
        entry.superset === existing.superset &&
        entry.sets.length === existing.sets.length &&
        entry.warmupSets.length === existing.warmupSets.length &&
        entry.sets.every((set, j) => sameMacroFactorSet(set, existing.sets[j])) &&
        entry.warmupSets.every((set, j) => sameMacroFactorSet(set, existing.warmupSets[j]));
    });
}

export function ImportUtils_findMacroFactorConflicts(
  records: IHistoryRecord[], existingHistory: IHistoryRecord[]
): Set<number> {
  const existingById = new Map(existingHistory.map((record) => [record.id, record]));
  return new Set(records.filter((record) => {
    if (record.source !== "macrofactor-workouts") return false;
    const existing = existingById.get(record.id);
    return existing?.source === "macrofactor-workouts" && !sameMacroFactorRecord(record, existing);
  }).map((record) => record.id));
}

export function ImportUtils_findDuplicates(records: IHistoryRecord[], existingHistory: IHistoryRecord[]): Set<number> {
  const existingIds = new Set(existingHistory.map((r) => r.id));
  // MacroFactor's calendar-only export anchors workouts at midnight, so the normal
  // ±1-minute comparison would incorrectly merge different sessions on the same date.
  const timedExisting = existingHistory.filter((record) => record.source !== "macrofactor-workouts");
  const existingStartTimes = timedExisting.map((record) => record.startTime).sort((a, b) => a - b);
  const duplicates = new Set<number>();
  for (const record of records) {
    if (existingIds.has(record.id)) {
      duplicates.add(record.id);
      continue;
    }
    if (record.source === "macrofactor-workouts") {
      if (existingHistory.some((existing) => sameMacroFactorRecord(record, existing))) {
        duplicates.add(record.id);
      }
      continue;
    }
    let lo = 0;
    let hi = existingStartTimes.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const diff = existingStartTimes[mid] - record.startTime;
      if (Math.abs(diff) <= duplicateToleranceMs) {
        duplicates.add(record.id);
        break;
      } else if (diff < 0) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
  }
  return duplicates;
}
