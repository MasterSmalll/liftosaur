import { JSX, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./primitives/text";
import { Select } from "./primitives/select";
import { LineChart } from "./lineChart";
import { Tailwind_colors } from "../utils/tailwindConfig";
import { Exercise_get, Exercise_toKey } from "../models/exercise";
import { IHistoryRecord, ISettings } from "../types";
import {
  IWorkoutHistoryGrouping,
  IWorkoutHistoryMeasure,
  WorkoutHistory_summarize,
  WorkoutHistory_totals,
  WorkoutHistory_trend,
} from "../models/workoutHistoryDashboard";

interface IProps {
  history: IHistoryRecord[];
  settings: ISettings;
}
const MEASURES: { value: IWorkoutHistoryMeasure; label: string }[] = [
  { value: "sets", label: "Working sets" },
  { value: "reps", label: "Repetitions" },
  { value: "volume", label: "Volume (Liftosaur)" },
  { value: "minutes", label: "Training minutes" },
  { value: "workouts", label: "Workout frequency" },
];

const PERIODS = [
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last year" },
  { value: "all", label: "All time" },
];

const GROUPINGS: { value: IWorkoutHistoryGrouping; label: string }[] = [
  { value: "workout", label: "Per workout" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
];

function readable(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
}

export function WorkoutHistoryDashboard(props: IProps): JSX.Element {
  const [program, setProgram] = useState("all");
  const [exercise, setExercise] = useState("all");
  const [period, setPeriod] = useState("365");
  const [grouping, setGrouping] = useState<IWorkoutHistoryGrouping>("week");
  const [measure, setMeasure] = useState<IWorkoutHistoryMeasure>("sets");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const allHistory = useMemo(
    () => props.history.filter((record) => record.vtype === "history_record"),
    [props.history]
  );

  const programs = useMemo(
    () => Array.from(new Set(allHistory.map((r) => r.programName).filter(Boolean)))
      .sort().map((p) => ({ value: p, label: p })),
    [allHistory]
  );

  const exercises = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of allHistory) {
      for (const entry of record.entries) {
        const key = Exercise_toKey(entry.exercise);
        const name = Exercise_get(entry.exercise, props.settings.exercises).name;
        map.set(key, name);
      }
    }
    return Array.from(map, ([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allHistory, props.settings.exercises]);

  const summaries = useMemo(
    () => WorkoutHistory_summarize(allHistory, props.settings, {
      exerciseKey: exercise === "all" ? undefined : exercise,
      program: program === "all" ? undefined : program,
      days: period === "all" ? undefined : Number(period),
    }),
    [allHistory, props.settings, exercise, program, period]
  );

  const totals = useMemo(() => WorkoutHistory_totals(summaries), [summaries]);
  const trend = useMemo(() => WorkoutHistory_trend(summaries, measure, grouping), [summaries, measure, grouping]);
  const chartData = useMemo<(number | null)[][]>(
    () => [trend.map((p) => p[0]), trend.map((p) => p[1])],
    [trend]
  );
  const selectedMeasure = MEASURES.find((m) => m.value === measure);
  const recent = showAll ? [...summaries].reverse() : [...summaries].reverse().slice(0, 20);

  return (
    <View className="mx-4 mb-8" testID="all-workout-history-dashboard">
      <View className="mb-3">
        <Text className="text-xl font-semibold text-text-primary">All Workouts — History</Text>
        <Text className="text-sm text-text-secondary">
          Every recorded workout, including imported sessions. Filter and inspect your trends.
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2 mb-3">
        <Select value={period} onChange={setPeriod} options={PERIODS} className="p-2 text-xs bg-background-default" />
        <Select
          value={program}
          onChange={setProgram}
          options={[{ value: "all", label: "All programs" }, ...programs]}
          className="p-2 text-xs bg-background-default"
        />
        <Select
          value={exercise}
          onChange={setExercise}
          options={[{ value: "all", label: "All exercises" }, ...exercises]}
          className="p-2 text-xs bg-background-default"
        />
      </View>

      {summaries.length === 0 ? (
        <Text className="text-sm text-text-secondary py-4">
          No workouts match these filters. Your data is unchanged; choose another period or exercise.
        </Text>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-2 mb-3">
            <Stat label="Workouts" value={readable(totals.workouts)} />
            <Stat label="Working sets" value={readable(totals.sets)} />
            <Stat label="Reps" value={readable(totals.reps)} />
            <Stat label="Training time" value={readable(totals.minutes / 60) + " h"} />
            <Stat label={`Volume (${props.settings.units})`} value={readable(totals.volume)} />
          </View>

          <View className="flex-row flex-wrap gap-2 mb-2">
            <Select
              value={measure}
              onChange={(v) => setMeasure(v as IWorkoutHistoryMeasure)}
              options={MEASURES}
              className="p-2 text-xs bg-background-default"
            />
            <Select
              value={grouping}
              onChange={(v) => setGrouping(v as IWorkoutHistoryGrouping)}
              options={GROUPINGS}
              className="p-2 text-xs bg-background-default"
            />
          </View>

          <Text className="text-sm font-semibold text-text-primary mb-1">
            {selectedMeasure?.label ?? "Performance"} — {grouping === "workout" ? "per workout" : grouping === "week" ? "weekly" : "monthly"}
          </Text>
          <LineChart
            data={chartData}
            series={[{ label: selectedMeasure?.label ?? measure, color: Tailwind_colors().blue[500], show: true, width: 2 }]}
            height={260}
            yAxisFormatter={readable}
            isInteractive={true}
          />

          <Text className="text-xs text-text-secondary mb-5">
            Training volume follows Liftosaur's calculation; it is not equivalent to total bodyweight moved.
            Workout duration is the entire session, even when filtered to one exercise.
          </Text>

          <Text className="text-lg font-semibold mb-2 text-text-primary">Workout log ({summaries.length})</Text>
          {recent.map((item) => (
            <View key={item.id} className="border-b border-border-neutral py-2">
              <Pressable
                accessibilityRole="button"
                testID={`history-dashboard-workout-${item.id}`}
                onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="font-semibold text-sm text-text-primary">{item.date} — {item.name}</Text>
                    <Text className="text-xs text-text-secondary">{item.program}</Text>
                  </View>
                  <Text className="text-xs text-text-secondary">
                    {item.sets} sets · {item.reps} reps · {readable(item.minutes)} min {expandedId === item.id ? "−" : "+"}
                  </Text>
                </View>
              </Pressable>
              {expandedId === item.id && (
                <View className="pl-3 pt-2">
                  {item.entries.map((entry) => (
                    <View key={entry.id} className="mb-1">
                      <Text className="text-sm text-text-primary">
                        {Exercise_get(entry.exercise, props.settings.exercises).name}:
                        {" "}{entry.sets.filter((s) => s.isCompleted || (s.completedReps ?? 0) > 0).length} sets
                        {" · "}{entry.sets.reduce((n, s) => n + (s.completedReps ?? 0), 0)} reps
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
          {summaries.length > 20 && (
            <Pressable accessibilityRole="button" className="py-3" onPress={() => setShowAll(!showAll)}>
              <Text className="text-sm font-semibold text-text-link">
                {showAll ? "Show 20 newest sessions" : `Show all ${summaries.length} sessions`}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

function Stat(props: { label: string; value: string }): JSX.Element {
  return (
    <View className="px-3 py-2 bg-background-cardpurple rounded-lg min-w-scaled-20">
      <Text className="text-xs text-text-secondary">{props.label}</Text>
      <Text className="text-base font-semibold text-text-primary">{props.value}</Text>
    </View>
  );
}
