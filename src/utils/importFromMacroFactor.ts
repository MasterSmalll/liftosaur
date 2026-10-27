import Papa from "papaparse";
import {
  ICustomExercise, IExerciseType, IHistoryEntry, IHistoryRecord, ISet, ISettings, VHistoryRecord,
} from "../types";
import { Weight_build } from "../models/weight";
import { Storage_validate } from "../models/storage";
import { ImportFileError, IImportResult, IImportRowError, ImportUtils_isSuspiciousWeight, ImportUtils_isSuspiciousReps } from "./importTypes";

// MacroFactor Workouts granular export, not the separate MacroFactor nutrition export.
// Do not add bodyweight to a pull-up/dip weight: the CSV already specifies external load.
const REQUIRED = ["Date", "Workout Duration", "Workout", "Exercise", "Set Type", "Weight (kg)", "Reps", "RIR"];

interface IMacroFactorRow {
  row: number;
  date: string;
  workout: string;
  duration: number;
  exercise: string;
  superset?: string;
  setType: string;
  weight?: number;
  reps?: number;
  rir?: number;
  setDuration?: number;
}

const KNOWN_EXERCISES: Record<string, IExerciseType> = {
  "Conventional Deadlift": { id: "deadlift", equipment: "barbell" },
  "Barbell Back Squat": { id: "squat", equipment: "barbell" },
  "Overhand Grip Weighted Pull-Up": { id: "pullUp", equipment: "bodyweight" },
  "Overhand Grip Pull-Up": { id: "pullUp", equipment: "bodyweight" },
  "Kipping Pull-Up": { id: "kippingPullUp", equipment: "bodyweight" },
};

function asNumber(s?: string): number | undefined {
  if (s == null || s.trim() === "") return undefined;
  const value = Number(s);
  return Number.isFinite(value) ? value : undefined;
}

function parseDate(raw: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:\s.*)?$/.exec(raw);
  if (!match) return undefined;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = Date.UTC(y, m - 1, d);
  const dt = new Date(utc);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? utc : undefined;
}

function simpleHash(s: string): number {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) hash = Math.imul(hash ^ s.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function extractExercise(raw: string): { name: string; superset?: string } {
  const m = /^(.*?)\s*∈\s*(SS\d+)\s*$/.exec(raw.trim());
  return m ? { name: m[1].trim(), superset: m[2] } : { name: raw.trim() };
}

function makeCustomExercise(name: string): ICustomExercise {
  const id = "macrofactor-" + name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    vtype: "custom_exercise",
    id,
    name,
    isDeleted: false,
    meta: { bodyParts: [], targetMuscles: [], synergistMuscles: [], sortedEquipment: [] },
    types: [],
  };
}

function buildSet(source: IMacroFactorRow, index: number, dateKey: string): ISet {
  const weight = source.weight != null ? Weight_build(source.weight, "kg") : undefined;
  return {
    vtype: "set",
    id: `mf-${dateKey}-${source.row}`,
    index,
    reps: source.reps,
    completedReps: source.reps,
    weight,
    originalWeight: weight,
    completedWeight: weight,
    completedSetTimer: source.setDuration,
    isCompleted: true,
    ...(source.rir == null ? {} : {
      customMetrics: { rir: source.rir },
      completedRpe: 10 - source.rir,
      rpeDerivedFromRir: true,
    }),
  };
}

export function ImportFromMacroFactor_convertCsvToHistoryRecords(raw: string, settings: ISettings): IImportResult {
  const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
  const fields = new Set((parsed.meta.fields ?? []).map((h) => h.trim()));
  if (!REQUIRED.every((header) => fields.has(header))) {
    throw new ImportFileError("This is not a MacroFactor Workouts granular CSV export.");
  }
  const errors: IImportRowError[] = [];
  const warnings: IImportRowError[] = [];
  const valid: IMacroFactorRow[] = [];
  for (const [index, row] of parsed.data.entries()) {
    const line = index + 2;
    const date = (row["Date"] ?? "").trim();
    const timestamp = parseDate(date);
    const workout = (row["Workout"] ?? "").trim();
    const name = extractExercise(row["Exercise"] ?? "");
    const setType = row["Set Type"]?.trim() ?? "";
    const duration = asNumber(row["Workout Duration"]);
    const reps = asNumber(row["Reps"]);
    const weight = asNumber(row["Weight (kg)"]);
    const rir = asNumber(row["RIR"]);
    const setDuration = asNumber(row["Duration"]);
    const hasInvalidNumber = (["Workout Duration", "Reps", "Weight (kg)", "RIR", "Duration"] as const)
      .some((key) => row[key]?.trim() && asNumber(row[key]) == null);
    if (timestamp == null || !workout || !name.name || duration == null || duration < 0 ||
      hasInvalidNumber || (reps == null && setDuration == null) || (rir != null && (rir < 0 || rir > 10)) ||
      (reps != null && reps < 0) || !["Warm-Up Set", "Standard Set"].includes(setType)) {
      errors.push({ row: line, message: "Invalid date, workout, exercise, type, reps, duration, weight, or RIR" });
      continue;
    }
    if (weight != null && ImportUtils_isSuspiciousWeight(weight, "kg")) {
      warnings.push({ row: line, column: "Weight (kg)", message: `Weight ${weight} kg looks implausible` });
    }
    if (reps != null && ImportUtils_isSuspiciousReps(reps)) {
      warnings.push({ row: line, column: "Reps", message: `Reps ${reps} looks implausible` });
    }
    valid.push({
      row: line, date: date.slice(0, 10), workout, duration, exercise: name.name, superset: name.superset,
      setType, weight, reps, rir, setDuration,
    });
  }
  if (valid.length === 0) throw new ImportFileError("No valid workout rows in MacroFactor export.");
  if (valid.length < parsed.data.length / 2) {
    throw new ImportFileError("Most rows in this MacroFactor export are malformed.");
  }

  const sessions = new Map<string, IMacroFactorRow[]>();
  for (const row of valid) {
    const key = row.date + "|" + row.workout;
    const group = sessions.get(key) ?? [];
    group.push(row);
    sessions.set(key, group);
  }

  const customExercises: Record<string, ICustomExercise> = {};
  const historyRecords: IHistoryRecord[] = [];
  for (const [key, rows] of sessions.entries()) {
    const first = rows[0];
    const starts = parseDate(first.date)!;
    const grouped = new Map<string, IMacroFactorRow[]>();
    for (const row of rows) {
      const entryKey = row.exercise + "|" + (row.superset ?? "");
      const sameExercise = grouped.get(entryKey) ?? [];
      sameExercise.push(row);
      grouped.set(entryKey, sameExercise);
    }
    const entries: IHistoryEntry[] = [];
    for (const [nameWithSuperset, itemRows] of grouped.entries()) {
      const firstSet = itemRows[0];
      const known = KNOWN_EXERCISES[firstSet.exercise];
      const custom = known ? undefined : makeCustomExercise(firstSet.exercise);
      if (custom) {
        // Existing custom exercises are preserved by the import-session machinery.
        if (settings.exercises[custom.id] == null) customExercises[custom.id] = custom;
      }
      const exercise: IExerciseType = known ?? { id: custom!.id, equipment: "bodyweight" };
      const split = (type: string): ISet[] => itemRows.filter((r) => r.setType === type)
        .map((r, index) => buildSet(r, index, first.date + "-" + simpleHash(nameWithSuperset)));
      const warmupSets = split("Warm-Up Set");
      const sets = split("Standard Set");
      if (sets.length >= 15 && sets.every((r) => r.reps === sets[0].reps && r.weight?.value === sets[0].weight?.value)) {
        warnings.push({
          row: firstSet.row,
          column: "Reps",
          message: `${sets.length} identical sets of ${sets[0].reps} repetitions for ${firstSet.exercise}; verify before import`,
        });
      }
      entries.push({
        vtype: "history_entry",
        id: `mf-${first.date}-${simpleHash(nameWithSuperset).toString(16)}`,
        index: entries.length,
        exercise,
        warmupSets,
        sets,
        superset: firstSet.superset,
      });
    }
    const startTime = starts; // Midnight UTC is a date anchor, NOT a claimed workout start time.
    const endTime = startTime + first.duration * 1000;
    const history: IHistoryRecord = {
      vtype: "history_record",
      date: new Date(starts).toISOString(),
      id: startTime + (simpleHash(key) % 1000),
      startTime, endTime,
      intervals: [[startTime, endTime]],
      day: 1,
      dayName: first.workout,
      programName: "MacroFactor Workouts",
      programId: "macroFactorWorkouts",
      entries,
      source: "macrofactor-workouts",
      notes: "Imported from MacroFactor Workouts. Source records calendar date and duration, but no exact start time.",
    };
    const validation = Storage_validate(history, VHistoryRecord, "historyRecord");
    if (validation.success) historyRecords.push(history);
    else errors.push({ row: first.row, message: `Workout failed validation: ${validation.error.join("; ")}` });
  }
  return { historyRecords, customExercises, errors, warnings };
}
