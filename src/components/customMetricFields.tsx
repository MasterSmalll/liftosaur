import type { JSX } from "react";
import { View, Pressable, TextInput } from "react-native";
import { Text } from "./primitives/text";
import { InputNumber2 } from "./inputNumber2";
import { ICustomMetricDefinition, ICustomMetricValue, ICustomMetricValues } from "../types";

interface IProps {
  definitions: ICustomMetricDefinition[];
  values?: ICustomMetricValues;
  onChange: (definition: ICustomMetricDefinition, value: ICustomMetricValue | undefined) => void;
}

// Reusable fields for set, exercise and workout scopes. The owner persists changes
// through its normal Liftosaur state lens, so offline storage and sync still apply.
export function CustomMetricFields(props: IProps): JSX.Element | null {
  if (props.definitions.length === 0) {
    return null;
  }
  return (
    <View className="mt-2 flex-row flex-wrap gap-3" testID="custom-metric-fields">
      {props.definitions.map((definition) => {
        const value = props.values?.[definition.id];
        return (
          <View key={definition.id} className="min-w-scaled-20" testID={`custom-metric-${definition.id}`}>
            <Text className="text-xs text-text-secondary">
              {definition.name}{definition.unit ? ` (${definition.unit})` : ""}
            </Text>
            {definition.kind === "number" ? (
              <InputNumber2
                name={`metric-${definition.id}`}
                inputCommitMode="blur"
                value={typeof value === "number" ? value : undefined}
                step={0.5}
                allowDot={true}
                allowNegative={definition.min == null || definition.min < 0}
                min={definition.min}
                max={definition.max}
                onBlur={(next) => props.onChange(definition, next)}
                testID={`metric-input-${definition.id}`}
              />
            ) : definition.kind === "boolean" ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: value === true }}
                className="py-2"
                onPress={() => props.onChange(definition, value === true ? false : true)}
              >
                <Text className="text-text-primary">{value === true ? "Yes" : "No"}</Text>
              </Pressable>
            ) : (
              <TextInput
                className="rounded border border-border-primary px-2 py-2 text-text-primary"
                placeholder={definition.name}
                value={typeof value === "string" ? value : ""}
                onChangeText={(next) => props.onChange(definition, next)}
                testID={`metric-input-${definition.id}`}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
