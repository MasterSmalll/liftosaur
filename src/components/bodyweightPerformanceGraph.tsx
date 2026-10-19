import { JSX, useMemo, useState } from "react";
import { View } from "react-native";
import { Text } from "./primitives/text";
import { Select } from "./primitives/select";
import { LineChart } from "./lineChart";
import { Tailwind_colors } from "../utils/tailwindConfig";
import { IHistoryRecord, ISettings, IStats } from "../types";
import { Weight_convertTo } from "../models/weight";
import { Bodyweight_bestSessionSets, Bodyweight_performance } from "../models/bodyweightPerformance";

interface IProps {
  history: IHistoryRecord[];
  stats: IStats;
  settings: ISettings;
}

function format(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function BodyweightPerformanceGraph(props: IProps): JSX.Element {
  const [exercise, setExercise] = useState("");
  const [days, setDays] = useState("all");
  const [showDetails, setShowDetails] = useState(true);
  const performances = useMemo(
    () => Bodyweight_performance(props.history, props.stats, props.settings),
    [props.history, props.stats, props.settings]
  );
  const available = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of performances) map.set(p.exerciseKey, p.exerciseName);
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [performances]);

  const key = available.some((x) => x.value === exercise) ? exercise : available[0]?.value ?? "";
  const best = useMemo(() => Bodyweight_bestSessionSets(performances, key), [performances, key]);
  const filtered = useMemo(() => {
    if (days === "all") return best;
    const newest = Math.max(...best.map((x) => Date.parse(x.date + "T00:00:00Z")));
    return best.filter((x) => Date.parse(x.date + "T00:00:00Z") >= newest - Number(days) * 86400000);
  }, [best, days]);
  const unit = props.settings.units;
  const toUnit = (kg: number): number => Weight_convertTo({ value: kg, unit: "kg" }, unit).value;
  const data = useMemo<(number | null)[][]>(
    () => [
      filtered.map((p) => Date.parse(p.date + "T12:00:00Z") / 1000),
      filtered.map((p) => p.loadSemantics === "external" ? toUnit(p.externalKg) : null),
      filtered.map((p) => p.bodyweight.status === "measured" && p.totalKg != null ? toUnit(p.totalKg) : null),
      filtered.map((p) => p.bodyweight.status === "estimated" && p.totalKg != null ? toUnit(p.totalKg) : null),
    ],
    [filtered, unit]
  );
  const colors = Tailwind_colors();
  return (
    <View className="mx-4 mb-8" testID="bodyweight-load-performance">
      <Text className="text-xl font-semibold text-text-primary">Pull-ups and dips — total load</Text>
      <Text className="text-sm text-text-secondary mb-2">
        Added weight stays separate from bodyweight. Estimated trend weights are not scale measurements.
      </Text>
      {available.length === 0 ? (
        <Text className="text-sm text-text-secondary py-3">No supported pull-up or dip workouts in this history.</Text>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-2 mb-2">
            <Select
              value={key}
              onChange={setExercise}
              options={available}
              className="p-2 text-xs bg-background-default"
            />
            <Select
              value={days}
              onChange={setDays}
              options={[{ value: "90", label: "90 days" }, { value: "365", label: "1 year" }, { value: "all", label: "All time" }]}
              className="p-2 text-xs bg-background-default"
            />
          </View>
          <LineChart
            data={data}
            series={[
              { label: "Added weight", color: colors.blue[500], show: true, width: 2 },
              { label: "Total (measured)", color: colors.green[500], show: true, width: 2 },
              { label: "Total (estimated)", color: colors.orange[500], show: true, width: 2 },
            ]}
            height={260}
            yAxisFormatter={(v) => format(v)}
            isInteractive={true}
          />
          <Text className="text-xs text-text-secondary mb-2">
            {unit}: heaviest completed set per session. Compare the same reps and RPE/RIR for strength trends.
            Unknown load conventions are deliberately excluded from the total-load lines.
          </Text>
          {showDetails && filtered.slice(-20).reverse().map((p) => (
            <View key={p.workoutId} className="py-2 border-b border-border-neutral">
              <Text className="text-sm text-text-primary">
                {p.date} · {p.reps} reps · +{format(toUnit(p.externalKg))} {unit} external load
              </Text>
              <Text className="text-xs text-text-secondary">
                {p.bodyweight.status === "measured"
                  ? `Measured weight: ${format(toUnit(p.bodyweight.kg))} ${unit}`
                  : p.bodyweight.status === "estimated"
                    ? `MacroFactor trend estimate: ${format(toUnit(p.bodyweight.kg))} ${unit}`
                    : "Bodyweight unavailable"}
                {p.totalKg == null ? " · total unknown" : ` · estimated system load: ${format(toUnit(p.totalKg))} ${unit}`}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
