import type { JSX } from "react";
import { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { Text } from "./primitives/text";
import { ICustomMetricDefinition, ICustomMetricKind, ICustomMetricScope, ISettings } from "../types";
import { IDispatch } from "../ducks/types";
import { lb } from "lens-shmens";
import { DEFAULT_CUSTOM_METRICS } from "../models/customMetrics";
import { MenuItemEditable } from "./menuItemEditable";

interface IProps {
  settings: ISettings;
  dispatch: IDispatch;
}
const SCOPES: ICustomMetricScope[] = ["set", "exercise", "workout"];
const KINDS: ICustomMetricKind[] = ["number", "boolean", "text"];

export function CustomMetricSettings(props: IProps): JSX.Element {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [scope, setScope] = useState<ICustomMetricScope>("set");
  const [kind, setKind] = useState<ICustomMetricKind>("number");
  const configured = props.settings.customMetricDefinitions ?? [];
  const byId = new Map(DEFAULT_CUSTOM_METRICS.map((metric) => [metric.id, metric]));
  for (const metric of configured) {
    byId.set(metric.id, metric);
  }
  const all = Array.from(byId.values());

  function save(definitions: ICustomMetricDefinition[]): void {
    props.dispatch({
      type: "UpdateSettings",
      lensRecording: lb<ISettings>().p("customMetricDefinitions").record(definitions),
      desc: "Update custom metric definitions",
    });
  }

  function update(definition: ICustomMetricDefinition): void {
    const old = configured.filter((metric) => metric.id !== definition.id);
    save([...old, definition]);
  }

  function create(): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const slug = trimmed.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "metric";
    const taken = new Set(all.map((d) => d.id));
    let id = slug;
    let suffix = 2;
    while (taken.has(id)) {
      id = `${slug}-${suffix++}`;
    }
    save([...configured, { id, name: trimmed, kind, scope, unit: unit.trim() || undefined }]);
    setName("");
    setUnit("");
  }

  return (
    <View className="pb-4" testID="custom-metric-settings">
      <Text className="text-sm text-text-secondary mt-2 mb-3">
        Custom measurements are saved with your Liftosaur workout history. Changing labels never deletes recorded values.
      </Text>
      {all.map((definition) => (
        <View key={definition.id} className="mb-2" testID={`custom-metric-setting-${definition.id}`}>
          <MenuItemEditable
            type="text"
            name={definition.name}
            value={definition.name}
            onChange={(newValue) => {
              if (newValue.trim()) {
                update({ ...definition, name: newValue.trim() });
              }
            }}
          />
          <Text className="text-xs text-text-secondary mx-2">
            {definition.scope} · {definition.kind}{definition.unit ? ` · ${definition.unit}` : ""}
          </Text>
          <MenuItemEditable
            type="boolean"
            name={`Enable ${definition.name}`}
            value={definition.disabled ? "false" : "true"}
            onChange={(next) => update({ ...definition, disabled: next !== "true" })}
          />
        </View>
      ))}
      <Text className="font-semibold mt-3 mb-2">Add metric</Text>
      <TextInput
        testID="new-metric-name"
        className="text-text-primary border border-border-primary rounded px-3 py-2 mb-2"
        placeholder="Metric name (e.g. Tempo)"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        testID="new-metric-unit"
        className="text-text-primary border border-border-primary rounded px-3 py-2 mb-2"
        placeholder="Unit (optional, e.g. m/s)"
        value={unit}
        onChangeText={setUnit}
      />
      <View className="flex-row flex-wrap gap-2 mb-3">
        {SCOPES.map((item) => (
          <Pressable
            key={item}
            className={`p-2 rounded border ${scope === item ? "border-text-primary" : "border-border-primary"}`}
            accessibilityRole="button"
            onPress={() => setScope(item)}
          >
            <Text className="text-text-primary">{item}</Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row flex-wrap gap-2 mb-3">
        {KINDS.map((item) => (
          <Pressable
            key={item}
            className={`p-2 rounded border ${kind === item ? "border-text-primary" : "border-border-primary"}`}
            accessibilityRole="button"
            onPress={() => setKind(item)}
          >
            <Text className="text-text-primary">{item}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable testID="create-custom-metric" className="bg-button-primarybackground rounded px-4 py-3" onPress={create}>
        <Text className="text-text-alwayswhite font-semibold">Add custom metric</Text>
      </Pressable>
    </View>
  );
}
