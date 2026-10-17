import {
  ICustomMetricDefinition,
  ICustomMetricScope,
  ICustomMetricValue,
  ICustomMetricValues,
  IHistoryRecord,
  ISet,
  ISettings,
} from "../types";
import { Exercise_toKey } from "./exercise";

// RIR is available out of the box without migrating existing settings.
export const DEFAULT_CUSTOM_METRICS: ICustomMetricDefinition[] = [
  { id: "rir", name: "RIR", scope: "set", kind: "number", min: 0, max: 10 },
];

export function CustomMetrics_definitions(
  settings: Pick<ISettings, "customMetricDefinitions">,
  scope?: ICustomMetricScope
): ICustomMetricDefinition[] {
  const byId = new Map<string, ICustomMetricDefinition>();
  for (const definition of DEFAULT_CUSTOM_METRICS.concat(settings.customMetricDefinitions ?? [])) {
    byId.set(definition.id, definition);
  }
  return Array.from(byId.values()).filter((d) => !d.disabled && (scope == null || d.scope === scope));
}

export function CustomMetrics_validate(
  definition: ICustomMetricDefinition,
  value: ICustomMetricValue | undefined
): boolean {
  if (value == null) {
    return true;
  }
  if (definition.kind === "boolean") {
    return typeof value === "boolean";
  }
  if (definition.kind === "text") {
    return typeof value === "string";
  }
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (definition.min == null || value >= definition.min) &&
    (definition.max == null || value <= definition.max)
  );
}

export function CustomMetrics_setValue(
  values: ICustomMetricValues | undefined,
  definition: ICustomMetricDefinition,
  value: ICustomMetricValue | undefined
): ICustomMetricValues {
  if (!CustomMetrics_validate(definition, value)) {
    return values ?? {};
  }
  const next = { ...(values ?? {}) };
  if (value === undefined) {
    delete next[definition.id];
  } else {
    next[definition.id] = value;
  }
  return next;
}

// Converting RIR to RPE is an estimate. Never overwrite a separately logged RPE.
export function CustomMetrics_updateSet(
  set: ISet,
  definition: ICustomMetricDefinition,
  value: ICustomMetricValue | undefined
): ISet {
  if (!CustomMetrics_validate(definition, value)) {
    return set;
  }
  const existingRir = set.customMetrics?.rir;
  const previouslyDerivedRpe =
    typeof existingRir === "number" &&
    set.completedRpe != null &&
    Math.abs(set.completedRpe - (10 - existingRir)) < 0.0001;

  const updated: ISet = {
    ...set,
    customMetrics: CustomMetrics_setValue(set.customMetrics, definition, value),
  };
  if (definition.id === "rir") {
    if (value === undefined && previouslyDerivedRpe) {
      updated.completedRpe = undefined;
    } else if (
      typeof value === "number" &&
      (set.completedRpe == null || previouslyDerivedRpe)
    ) {
      updated.completedRpe = 10 - value;
    }
  }
  return updated;
}

function average(values: number[]): number | undefined {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

// One date-point per workout; set/exercise metrics use the mean of available observations.
// Optional exerciseKey is the stable Liftosaur exercise key, NOT the exercise's display name.
export function CustomMetrics_numericSeries(
  history: IHistoryRecord[],
  definition: ICustomMetricDefinition,
  exerciseKey?: string
): [number, number][] {
  if (definition.kind !== "number") {
    return [];
  }
  const points: [number, number][] = [];
  for (const record of history) {
    const values: number[] = [];
    if (definition.scope === "workout") {
      const value = record.customMetrics?.[definition.id];
      if (typeof value === "number" && Number.isFinite(value)) {
        values.push(value);
      }
    } else {
      for (const entry of record.entries) {
        if (exerciseKey != null && Exercise_toKey(entry.exercise) !== exerciseKey) {
          continue;
        }
        if (definition.scope === "exercise") {
          const value = entry.customMetrics?.[definition.id];
          if (typeof value === "number" && Number.isFinite(value)) {
            values.push(value);
          }
        } else {
          for (const set of entry.sets) {
            // Do not count unperformed sets as measurements.
            if (!set.isCompleted && set.completedReps == null && set.completedSetTimer == null) {
              continue;
            }
            const value = set.customMetrics?.[definition.id];
            if (typeof value === "number" && Number.isFinite(value)) {
              values.push(value);
            }
          }
        }
      }
    }
    const result = average(values);
    if (result != null) {
      points.push([record.startTime / 1000, result]);
    }
  }
  return points.sort((a, b) => a[0] - b[0]);
}
