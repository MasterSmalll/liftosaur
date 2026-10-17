import type { JSX } from "react";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Text } from "./primitives/text";
import { Select } from "./primitives/select";
import { LineChart } from "./lineChart";
import { Tailwind_colors } from "../utils/tailwindConfig";
import { ICustomMetricDefinition, IHistoryRecord, ISettings } from "../types";
import { CustomMetrics_numericSeries } from "../models/customMetrics";
import { Exercise_get, Exercise_toKey } from "../models/exercise";

interface IProps {
  metric: ICustomMetricDefinition;
  history: IHistoryRecord[];
  settings: ISettings;
}

export function CustomMetricGraph(props: IProps): JSX.Element | null {
  const [exercise, setExercise] = useState("all");
  const [program, setProgram] = useState("all");
  const [period, setPeriod] = useState("365");

  const exercises = useMemo(() => {
    const results = new Map<string, string>();
    for (const record of props.history) {
      for (const entry of record.entries) {
        const key = Exercise_toKey(entry.exercise);
        const name = Exercise_get(entry.exercise, props.settings.exercises).name;
        results.set(key, name);
      }
    }
    return Array.from(results, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [props.history, props.settings.exercises]);

  const programs = useMemo(
    () => Array.from(new Set(props.history.map((h) => h.programName).filter(Boolean))).sort(),
    [props.history]
  );

  const filtered = useMemo(() => {
    // Match time against the newest recorded workout, not against wall clock time.
    const latest = props.history.reduce((max, record) => Math.max(max, record.startTime), 0);
    const earliest = period === "all" ? 0 : latest - Number(period) * 86400 * 1000;
    return props.history.filter(
      (record) => record.startTime >= earliest && (program === "all" || record.programName === program)
    );
  }, [props.history, program, period]);

  const points = useMemo(
    () => CustomMetrics_numericSeries(filtered, props.metric, exercise === "all" ? undefined : exercise),
    [filtered, props.metric, exercise]
  );

  const data = useMemo<(number | null)[][]>(() => [
    points.map((point) => point[0]),
    points.map((point) => point[1]),
  ], [points]);

  if (props.metric.kind !== "number") {
    return null;
  }
  return (
    <View testID={`metric-graph-${props.metric.id}`}>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-lg font-semibold text-text-primary">
          {props.metric.name}{props.metric.unit ? ` (${props.metric.unit})` : ""}
        </Text>
        <Text className="text-xs text-text-secondary">Average per workout</Text>
      </View>
      <View className="flex-row flex-wrap gap-2 mb-2">
        {props.metric.scope !== "workout" && (
          <Select
            value={exercise}
            onChange={setExercise}
            options={[{ value: "all", label: "All exercises" }, ...exercises]}
            className="p-2 text-xs bg-background-default"
          />
        )}
        <Select
          value={program}
          onChange={setProgram}
          options={[{ value: "all", label: "All programs" }, ...programs.map((p) => ({ value: p, label: p }))]}
          className="p-2 text-xs bg-background-default"
        />
        <Select
          value={period}
          onChange={setPeriod}
          options={[
            { value: "90", label: "90 days" },
            { value: "365", label: "1 year" },
            { value: "all", label: "All time" },
          ]}
          className="p-2 text-xs bg-background-default"
        />
      </View>
      {points.length > 0 ? (
        <LineChart
          data={data}
          series={[{ label: props.metric.name, color: Tailwind_colors().blue[500], show: true, width: 2 }]}
          height={260}
          yAxisFormatter={(value) => `${Math.round(value * 100) / 100}`}
          isInteractive={true}
        />
      ) : (
        <Text className="text-sm text-text-secondary py-4">No recorded values for these filters yet.</Text>
      )}
    </View>
  );
}
