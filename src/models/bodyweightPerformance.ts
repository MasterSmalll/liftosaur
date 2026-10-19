import { IBodyweightTrendPoint, IHistoryRecord, ISettings, IStats, IStatsWeightValue } from "../types";
import { Weight_convertTo } from "./weight";
import { Exercise_get } from "./exercise";

/** Measured ≠ trend-estimated ≠ unknown. Never alter completedWeight or set prescriptions. */
export type IBodyweightEvidence =
  | { status: "measured"; date: string; kg: number; timestamp: number }
  | { status: "estimated"; date: string; kg: number; source: "macrofactor" }
  | { status: "unknown"; date: string };

export interface IBodyweightPerformance {
  workoutId: number;
  date: string;
  exerciseKey: string;
  exerciseName: string;
  setId: string;
  reps: number;
  externalKg: number;
  bodyweight: IBodyweightEvidence;
  totalKg?: number;
  /** Imported loads are external; native loads need a documented per-exercise interpretation. */
  loadSemantics: "external" | "unverified";
}

function calendarDay(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(timestamp));
  const val = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return [val("year"), val("month"), val("day")].join("-");
}
function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

/** Import only the Trend Weight sheet (not food/energy data), without treating estimates as weigh-ins. */
export function Bodyweight_parseMacroFactorTrend(csv: string): IBodyweightTrendPoint[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((x) => x.trim());
  if (lines.length < 2) throw new Error("Missing Trend Weight rows");
  const header = lines[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const dateIndex = header.indexOf("Date");
  const weightIndex = header.indexOf("Trend Weight (kg)");
  if (dateIndex < 0 || weightIndex < 0) throw new Error("Expected Date and Trend Weight (kg) columns");
  const result = new Map<string, IBodyweightTrendPoint>();
  for (const [index, line] of lines.slice(1).entries()) {
    const fields = line.split(",");
    const day = (fields[dateIndex] ?? "").trim().slice(0, 10);
    const raw = (fields[weightIndex] ?? "").trim();
    if (!raw) continue;
    const kg = Number(raw);
    if (!validDate(day) || !Number.isFinite(kg) || kg < 20 || kg > 500) {
      throw new Error(`Invalid trend value on CSV row ${index + 2}`);
    }
    if (result.has(day)) throw new Error(`Duplicate trend date: ${day}`);
    result.set(day, { date: day, kg, source: "macrofactor" });
  }
  if (result.size === 0) throw new Error("No valid trend weights found");
  return Array.from(result.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function Bodyweight_forWorkout(
  date: string,
  stats: IStats,
  options: { timeZone?: string } = {}
): IBodyweightEvidence {
  if (!validDate(date)) return { status: "unknown", date };
  const zone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  let measured: IStatsWeightValue | undefined;
  for (const record of stats.weight.weight ?? []) {
    // Calendar date is explicit for imported MacroFactor sessions, no fake clock time.
    if (calendarDay(record.timestamp, zone) === date &&
        (measured == null || record.timestamp < measured.timestamp)) {
      measured = record;
    }
  }
  if (measured) {
    return {
      status: "measured", date,
      kg: Weight_convertTo(measured.value, "kg").value,
      timestamp: measured.timestamp,
    };
  }
  const estimated = (stats.bodyweightTrend ?? []).find((t) => t.date === date);
  return estimated
    ? { status: "estimated", date, kg: estimated.kg, source: estimated.source }
    : { status: "unknown", date };
}

function supportedMovement(id: string, name: string): boolean {
  if (/kipping|assist|banded/i.test(id + " " + name)) return false;
  if (id === "pullUp") return true;
  return /^(?:Weighted Dip|Chest Dip|Triceps Dip|Dip|Pull Up|Pull-Up|Chin Up)$/i.test(name.trim());
}
function macroFactorExternalLoad(record: IHistoryRecord): boolean {
  return record.source === "macrofactor-workouts" ||
    /\bMacroFactor Workouts\b/i.test(record.notes ?? "");
}

/** Historical MacroFactor weights explicitly describe *added* load. Native records aren't assumed. */
export function Bodyweight_performance(
  history: IHistoryRecord[],
  stats: IStats,
  settings: ISettings,
  options: { timeZone?: string } = {}
): IBodyweightPerformance[] {
  const points: IBodyweightPerformance[] = [];
  for (const record of history) {
    const date = record.date.slice(0, 10);
    const weight = Bodyweight_forWorkout(date, stats, options);
    const external = macroFactorExternalLoad(record);
    for (const entry of record.entries) {
      const name = Exercise_get(entry.exercise, settings.exercises).name;
      if (!supportedMovement(entry.exercise.id, name)) continue;
      for (const set of entry.sets) {
        if (!set.isCompleted && set.completedReps == null) continue;
        const reps = set.completedReps ?? 0;
        if (reps <= 0) continue;
        const load = set.completedWeight ?? set.weight;
        if (!load) continue;
        const externalKg = Weight_convertTo(load, "kg").value;
        if (!Number.isFinite(externalKg) || externalKg < 0) continue; // assisted loading excluded
        points.push({
          workoutId: record.id,
          date,
          exerciseKey: entry.exercise.id + "_" + (entry.exercise.equipment ?? "none"),
          exerciseName: name,
          setId: set.id,
          reps,
          externalKg,
          bodyweight: weight,
          loadSemantics: external ? "external" : "unverified",
          // Never double count when the native load could already include bodyweight.
          ...(external && weight.status !== "unknown" ? { totalKg: externalKg + weight.kg } : {}),
        });
      }
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date) || a.workoutId - b.workoutId);
}

/** One comparable point per session: heaviest recorded completed set (not a 1RM estimate). */
export function Bodyweight_bestSessionSets(
  points: IBodyweightPerformance[],
  exerciseKey: string
): IBodyweightPerformance[] {
  const sessions = new Map<number, IBodyweightPerformance>();
  for (const point of points) {
    if (point.exerciseKey !== exerciseKey) continue;
    const previous = sessions.get(point.workoutId);
    if (!previous || point.externalKg > previous.externalKg) sessions.set(point.workoutId, point);
  }
  return Array.from(sessions.values()).sort((a, b) => a.date.localeCompare(b.date));
}
