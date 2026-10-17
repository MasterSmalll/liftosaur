import { UserDao, ILimitedUserDao } from "../dao/userDao";
import { IDI } from "./di";
import { IApiError } from "./apiv1";
import { IEither } from "../../src/utils/types";
import { ICustomMetricDefinition, ICustomMetricValue, IHistoryRecord, VCustomMetricDefinition } from "../../src/types";
import { CustomMetrics_definitions, CustomMetrics_setValue, CustomMetrics_updateSet, CustomMetrics_validate } from "../../src/models/customMetrics";
import { CustomMetrics_numericSeries } from "../../src/models/customMetrics";
import { WorkoutHistory_summarize, WorkoutHistory_totals, WorkoutHistory_trend, IWorkoutHistoryMeasure, IWorkoutHistoryGrouping } from "../../src/models/workoutHistoryDashboard";
import * as v from "valibot";

type Result<T> = IEither<T, IApiError>;
const ok = <T>(data: T): Result<T> => ({ success: true, data });
const err = <T>(status: number, code: string, message: string): Result<T> => ({
  success: false, error: { status, code, message },
});

function positiveId(value: unknown): number | undefined {
  const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function validatePagination(value: unknown, fallback: number, max: number): number | undefined {
  if (value === undefined) return fallback;
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= max ? n : undefined;
}

function recordResult(record: IHistoryRecord): IHistoryRecord {
  // Return the original typed record. Unlike Liftohistory text this retains all
  // set/entry/session fields, custom metrics, RIR/RPE provenance, warmups, time and notes.
  // The DAO has removed its internal userId before reaching this function.
  return record;
}

export async function ApiV1_getStructuredHistory(
  userId: string,
  user: ILimitedUserDao,
  params: { limit?: unknown; cursor?: unknown; includeCurrent?: unknown },
  di: IDI
): Promise<Result<{ records: IHistoryRecord[]; nextCursor?: number; hasMore: boolean; currentWorkout?: IHistoryRecord }>> {
  const limit = validatePagination(params.limit, 30, 100);
  const cursor = params.cursor == null ? undefined : positiveId(params.cursor);
  if (!limit || (params.cursor != null && !cursor) ||
      (params.includeCurrent != null && typeof params.includeCurrent !== "boolean")) {
    return err(400, "invalid_input", "limit must be 1-100, cursor must be a positive record ID, includeCurrent must be boolean");
  }
  const dao = new UserDao(di);
  const history = await dao.getHistoryByUserId(userId, { limit: limit + 1, after: cursor });
  const selected = history.slice(0, limit);
  const hasMore = history.length > limit;
  return ok({
    records: selected.map(recordResult),
    hasMore,
    ...(hasMore && selected.length > 0 ? { nextCursor: selected[selected.length - 1].id } : {}),
    ...(params.includeCurrent ? { currentWorkout: user.storage.progress?.[0] } : {}),
  });
}

export function ApiV1_getCustomMetricDefinitions(
  user: ILimitedUserDao
): Result<{ definitions: ICustomMetricDefinition[]; availableScopes: string[]; supportedTypes: string[] }> {
  return ok({
    definitions: CustomMetrics_definitions(user.storage.settings),
    availableScopes: ["set", "exercise", "workout"],
    supportedTypes: ["number", "boolean", "text"],
  });
}

export async function ApiV1_getTrainingAnalytics(
  userId: string,
  user: ILimitedUserDao,
  params: { program?: unknown; exerciseKey?: unknown; days?: unknown; grouping?: unknown; measure?: unknown; metricId?: unknown },
  di: IDI
): Promise<Result<{
  units: string;
  totals: ReturnType<typeof WorkoutHistory_totals>;
  workouts: number;
  timeline: [number, number][];
  metricTimeline?: [number, number][];
  metric?: ICustomMetricDefinition;
  filters: object;
}>> {
  if (params.program != null && (typeof params.program !== "string" || params.program.length > 120)) {
    return err(400, "invalid_input", "program must be a string of up to 120 characters");
  }
  if (params.exerciseKey != null && (typeof params.exerciseKey !== "string" || params.exerciseKey.length > 120)) {
    return err(400, "invalid_input", "exerciseKey must be a Liftosaur exercise key");
  }
  const grouping = params.grouping ?? "week";
  const measure = params.measure ?? "sets";
  if (!["workout", "week", "month"].includes(String(grouping)) ||
      !["workouts", "sets", "reps", "minutes", "volume"].includes(String(measure))) {
    return err(400, "invalid_input", "Unsupported measure or grouping");
  }
  const days = params.days == null ? undefined : validatePagination(params.days, 365, 36500);
  if (params.days != null && days == null) return err(400, "invalid_input", "days must be 1-36500");
  const defs = CustomMetrics_definitions(user.storage.settings);
  const metric = params.metricId == null ? undefined : defs.find((d) => d.id === params.metricId);
  if (params.metricId != null && (!metric || metric.kind !== "number")) {
    return err(400, "invalid_input", "metricId must refer to an enabled numeric custom metric");
  }

  const history = await new UserDao(di).getHistoryByUserId(userId);
  const filtered = history.filter((record) => record.vtype === "history_record");
  const summaries = WorkoutHistory_summarize(filtered, user.storage.settings, {
    exerciseKey: params.exerciseKey as string | undefined,
    program: params.program as string | undefined,
    days,
  });
  const matchedIds = new Set(summaries.map((s) => s.id));
  const selectedRecords = filtered.filter((record) => matchedIds.has(record.id));
  return ok({
    units: user.storage.settings.units,
    totals: WorkoutHistory_totals(summaries),
    workouts: summaries.length,
    timeline: WorkoutHistory_trend(summaries, measure as IWorkoutHistoryMeasure, grouping as IWorkoutHistoryGrouping),
    ...(metric ? {
      metric,
      metricTimeline: CustomMetrics_numericSeries(selectedRecords, metric, params.exerciseKey as string | undefined),
    } : {}),
    filters: { grouping, measure, days: days ?? "all", program: params.program ?? "all", exerciseKey: params.exerciseKey ?? "all" },
  });
}

export async function ApiV1_upsertCustomMetricDefinition(
  user: ILimitedUserDao,
  input: unknown,
  deviceId: string,
  di: IDI
): Promise<Result<{ definition: ICustomMetricDefinition }>> {
  const parsed = v.safeParse(VCustomMetricDefinition, input);
  if (!parsed.success) return err(400, "invalid_input", "Invalid metric definition");
  const definition = parsed.output;
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(definition.id) || !definition.name.trim() ||
      definition.name.length > 100 || (definition.unit?.length ?? 0) > 30 ||
      (definition.min != null && !Number.isFinite(definition.min)) ||
      (definition.max != null && !Number.isFinite(definition.max)) ||
      (definition.min != null && definition.max != null && definition.min > definition.max)) {
    return err(400, "invalid_input", "Invalid metric id, name, unit, or range");
  }
  const previous = CustomMetrics_definitions(user.storage.settings).find((d) => d.id === definition.id);
  if (previous && (previous.kind !== definition.kind || previous.scope !== definition.scope)) {
    return err(409, "metric_schema_locked", "A metric's kind and scope cannot change after creation");
  }
  await new UserDao(di).applyStorageUpdate(
    user,
    (old) => ({
      ...old,
      settings: {
        ...old.settings,
        customMetricDefinitions: [
          ...(old.settings.customMetricDefinitions ?? []).filter((d) => d.id !== definition.id),
          definition,
        ],
      },
    }),
    deviceId
  );
  return ok({ definition });
}

export async function ApiV1_setHistoryCustomMetric(
  userId: string,
  user: ILimitedUserDao,
  input: {
    recordId?: unknown; metricId?: unknown; entryId?: unknown; setId?: unknown;
    warmup?: unknown; value?: unknown; expectedUpdatedAt?: unknown;
  },
  deviceId: string,
  di: IDI
): Promise<Result<{ recordId: number; metricId: string; value: ICustomMetricValue | null; updatedAt: number }>> {
  const recordId = positiveId(input.recordId);
  if (!recordId || typeof input.metricId !== "string") {
    return err(400, "invalid_input", "recordId and metricId are required");
  }
  const definition = CustomMetrics_definitions(user.storage.settings).find((d) => d.id === input.metricId);
  if (!definition) return err(404, "not_found", "Custom metric not found or disabled");
  if (!("value" in input)) return err(400, "invalid_input", "Supply a value, or null to clear it");
  const value: ICustomMetricValue | undefined = input.value === null ? undefined : input.value as ICustomMetricValue;
  if (!CustomMetrics_validate(definition, value)) return err(400, "invalid_input", "Value does not match metric kind/range");
  if (definition.scope !== "workout" && (typeof input.entryId !== "string" || input.entryId.length > 120)) {
    return err(400, "invalid_input", "entryId is required for exercise/set metrics");
  }
  if (definition.scope === "set" && (typeof input.setId !== "string" || input.setId.length > 120)) {
    return err(400, "invalid_input", "setId is required for set metrics");
  }
  if (input.warmup != null && typeof input.warmup !== "boolean") {
    return err(400, "invalid_input", "warmup must be boolean");
  }
  const dao = new UserDao(di);
  const matches = await dao.getHistoryByUserId(userId, { ids: [recordId], consistentRead: true });
  if (matches.length !== 1) return err(404, "not_found", "Workout record not found");
  const record = matches[0];
  if (input.expectedUpdatedAt != null && input.expectedUpdatedAt !== (record.updatedAt ?? null)) {
    return err(409, "version_conflict", "Workout has changed; reread it before applying your update");
  }
  const entries = [...record.entries];
  let updated: IHistoryRecord = record;
  if (definition.scope === "workout") {
    updated = { ...record, customMetrics: CustomMetrics_setValue(record.customMetrics, definition, value) };
  } else {
    const idx = entries.findIndex((e) => e.id === input.entryId);
    if (idx < 0) return err(404, "not_found", "Exercise entry not found");
    const entry = entries[idx];
    if (definition.scope === "exercise") {
      entries[idx] = { ...entry, customMetrics: CustomMetrics_setValue(entry.customMetrics, definition, value) };
    } else {
      const field = input.warmup ? "warmupSets" : "sets";
      const sets = [...entry[field]];
      const setIndex = sets.findIndex((s) => s.id === input.setId);
      if (setIndex < 0) return err(404, "not_found", "Set not found in the selected exercise/warmup group");
      sets[setIndex] = CustomMetrics_updateSet(sets[setIndex], definition, value);
      entries[idx] = { ...entry, [field]: sets };
    }
    updated = { ...record, entries };
  }
  const updatedAt = Math.max(Date.now(), (record.updatedAt ?? 0) + 1);
  updated = { ...updated, updatedAt };
  const existing = await dao.getHistoryByUserId(userId);
  user.storage = { ...user.storage, history: existing };
  await dao.applyStorageUpdate(user, (old) => ({
    ...old, history: (old.history ?? []).map((r) => r.id === recordId ? updated : r),
  }), deviceId, [dao.saveHistoryRecord(userId, updated)]);
  return ok({ recordId, metricId: definition.id, value: value ?? null, updatedAt });
}
