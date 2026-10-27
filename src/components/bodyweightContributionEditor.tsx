import { JSX, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { lb } from "lens-shmens";
import { Text } from "./primitives/text";
import { Select } from "./primitives/select";
import { InputNumber2 } from "./inputNumber2";
import { IBodyweightContributionProvenance, IBodyweightContributionRevision, ISettings } from "../types";
import { IDispatch } from "../ducks/types";
import { updateSettings } from "../models/state";

interface IProps {
  exerciseKey: string;
  exerciseName: string;
  settings: ISettings;
  dispatch: IDispatch;
}

const SOURCES: { value: IBodyweightContributionProvenance; label: string }[] = [
  { value: "user-estimate", label: "Personal estimate (not validated)" },
  { value: "user-confirmed-macrofactor", label: "Read directly from MacroFactor" },
  { value: "study-based-estimate", label: "Study-based estimate" },
];

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const millis = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === s;
}

/** Native settings editor. Explicit user action is required; we never assign
 * unverified default values (e.g. 95%) to exercise definitions. */
export function BodyweightContributionEditor(props: IProps): JSX.Element {
  const definitions = props.settings.exerciseData[props.exerciseKey]?.bodyweightContributions ?? [];
  const latest = [...definitions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const [pct, setPct] = useState<number | undefined>(latest == null ? undefined : latest.fraction * 100);
  const [effectiveFrom, setEffectiveFrom] = useState(latest?.effectiveFrom ?? "1900-01-01");
  const [provenance, setProvenance] = useState<IBodyweightContributionProvenance>(
    latest?.provenance ?? "user-estimate"
  );
  const [reference, setReference] = useState(latest?.reference ?? "");
  const [feedback, setFeedback] = useState("");
  const hasExisting = definitions.some((r) => r.effectiveFrom === effectiveFrom);
  const ready = pct != null && Number.isFinite(pct) && pct >= 0 && pct <= 100 && validDate(effectiveFrom);

  function persist(updated: IBodyweightContributionRevision[]): void {
    updateSettings(
      props.dispatch,
      lb<ISettings>().p("exerciseData").recordModify((exerciseData) => ({
        ...exerciseData,
        [props.exerciseKey]: {
          ...exerciseData[props.exerciseKey],
          bodyweightContributions: updated,
        },
      })),
      `Save bodyweight contribution history: ${props.exerciseKey}`
    );
  }

  function save(): void {
    if (!ready || pct == null) {
      setFeedback("Enter a valid percent (0–100) and effective date (YYYY-MM-DD).");
      return;
    }
    const revision: IBodyweightContributionRevision = {
      effectiveFrom,
      fraction: pct / 100,
      provenance,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    };
    persist([...definitions.filter((r) => r.effectiveFrom !== effectiveFrom), revision]
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)));
    setFeedback("Coefficient saved for this exercise and effective date.");
  }

  function remove(): void {
    persist(definitions.filter((r) => r.effectiveFrom !== effectiveFrom));
    setPct(undefined);
    setFeedback("Coefficient removed; original workout loads are unchanged.");
  }

  return (
    <View className="border border-border-neutral rounded-lg px-3 py-3 my-3"
      testID={`bodyweight-contribution-editor-${props.exerciseKey}`}>
      <Text className="text-base font-semibold text-text-primary mb-1">Bodyweight contribution — {props.exerciseName}</Text>
      <Text className="text-xs text-text-secondary mb-3">
        A custom approximation of resistance, NOT a measurement of muscular force.
        No default percentage is assumed. 100% static bodyweight support is tracked separately.
      </Text>
      <View className="flex-row flex-wrap gap-3 items-center mb-3">
        <View>
          <Text className="text-xs text-text-secondary mb-1">Contribution (%)</Text>
          <InputNumber2
            key={props.exerciseKey + ":" + effectiveFrom + ":" + String(latest?.fraction)}
            name="bodyweight-contribution-percent"
            value={pct}
            min={0}
            max={100}
            step={1}
            allowDot={true}
            inputCommitMode="blur"
            onBlur={setPct}
            testID="bodyweight-contribution-percent"
          />
        </View>
        <View>
          <Text className="text-xs text-text-secondary mb-1">Effective from (YYYY-MM-DD)</Text>
          <TextInput
            testID="bodyweight-contribution-date"
            value={effectiveFrom}
            onChangeText={setEffectiveFrom}
            className="px-2 py-2 rounded border border-border-primary text-text-primary"
          />
        </View>
      </View>
      <Text className="text-xs text-text-secondary mb-1">Coefficient source</Text>
      <Select
        value={provenance}
        onChange={(s) => setProvenance(s as IBodyweightContributionProvenance)}
        options={SOURCES}
        className="p-2 bg-background-default"
      />
      <TextInput
        testID="bodyweight-contribution-reference"
        className="mt-2 px-2 py-2 rounded border border-border-primary text-text-primary"
        value={reference}
        onChangeText={setReference}
        placeholder="Source, method or study (optional)"
      />
      <View className="flex-row gap-3 mt-3">
        <Pressable accessibilityRole="button" disabled={!ready}
          testID="save-bodyweight-contribution"
          className="rounded border border-border-primary p-2"
          onPress={save}>
          <Text className="text-text-primary font-semibold">{hasExisting ? "Update coefficient" : "Add coefficient"}</Text>
        </Pressable>
        {hasExisting && (
          <Pressable accessibilityRole="button" testID="remove-bodyweight-contribution"
            className="p-2" onPress={remove}>
            <Text className="text-text-primary">Remove revision</Text>
          </Pressable>
        )}
      </View>
      {feedback ? <Text className="text-xs text-text-secondary mt-2">{feedback}</Text> : null}
      {definitions.length > 0 && (
        <View className="mt-3">
          <Text className="text-xs font-semibold text-text-primary mb-1">Saved revisions</Text>
          {[...definitions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).map((r) => (
            <Pressable key={r.effectiveFrom} accessibilityRole="button"
              onPress={() => { setEffectiveFrom(r.effectiveFrom); setPct(r.fraction * 100);
                setProvenance(r.provenance); setReference(r.reference ?? ""); setFeedback(""); }}>
              <Text className="text-xs text-text-secondary py-1">
                {r.effectiveFrom} · {r.fraction * 100}% · {r.provenance}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
