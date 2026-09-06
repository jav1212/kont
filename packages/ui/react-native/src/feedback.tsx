import { View, type ViewProps } from "react-native";
import type { UiIntent } from "@kontave/ui/contracts";
import { Text } from "./typography";
import { useUiTheme } from "./theme";

export interface AlertProps extends ViewProps {
  readonly intent?: Extract<
    UiIntent,
    "info" | "success" | "warning" | "danger"
  >;
}
export interface StatusBadgeProps extends ViewProps {
  readonly intent?: Exclude<UiIntent, "primary">;
}

/**
 * Presents consumer-supplied feedback without subscribing to application services.
 * @param props - Message content, semantic intent and native view props.
 * @returns A themed feedback region with appropriate announcement urgency.
 */
export function Alert({
  children,
  intent = "info",
  style,
  ...props
}: AlertProps) {
  const { colors } = useUiTheme();
  return (
    <View
      {...props}
      accessibilityRole={intent === "danger" ? "alert" : undefined}
      accessibilityLiveRegion={intent === "danger" ? "assertive" : "polite"}
      style={[
        {
          borderWidth: 1,
          borderColor: colors[intent],
          backgroundColor: colors.surface,
          borderRadius: 8,
          padding: 12,
        },
        style,
      ]}
    >
      <Text style={{ color: colors[intent] }}>{children}</Text>
    </View>
  );
}

/**
 * Displays a status label without interpreting domain state.
 * @param props - Supplied status content and visual intent.
 * @returns A compact themed status badge.
 */
export function StatusBadge({
  children,
  intent = "neutral",
  style,
  ...props
}: StatusBadgeProps) {
  const { colors } = useUiTheme();
  return (
    <View
      {...props}
      style={[
        {
          alignSelf: "flex-start",
          backgroundColor: colors.surfaceMuted,
          borderRadius: 9999,
          paddingHorizontal: 8,
          paddingVertical: 4,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: intent === "neutral" ? colors.muted : colors[intent],
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {children}
      </Text>
    </View>
  );
}
