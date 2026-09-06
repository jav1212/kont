import { Children, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
} from "react-native";
import type { InteractiveState, UiIntent, UiSize } from "@kontave/ui/contracts";
import { nativeMetrics } from "@kontave/ui/tokens";
import { useUiTheme } from "./theme";
import { Text } from "./typography";

export type ButtonAppearance = "solid" | "outline" | "text" | "unstyled";
export interface ButtonProps
  extends
    Omit<PressableProps, "children" | "onPress" | "disabled">,
    InteractiveState {
  readonly children?: ReactNode;
  readonly onPress?: () => void;
  readonly intent?: UiIntent;
  readonly size?: UiSize;
  readonly appearance?: ButtonAppearance;
  readonly iconOnly?: boolean;
  readonly controlHeight?: number;
}

/**
 * Renders one accessible action, suppressing activation while disabled or busy.
 * @param props - Content, action, semantic appearance and native accessibility props.
 * @returns A themed pressable with a retained label and busy indicator.
 */
export function Button({
  children,
  onPress,
  disabled = false,
  loading = false,
  intent = "primary",
  size = "md",
  appearance = "solid",
  iconOnly,
  controlHeight,
  style,
  ...props
}: ButtonProps) {
  const { colors } = useUiTheme();
  const inactive = disabled || loading;
  const foreground = intent === "neutral" ? colors.text : colors[intent];
  const solid = appearance === "solid";
  const labelColor =
    solid && intent !== "neutral" ? colors.onPrimary : foreground;
  return (
    <Pressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? "button"}
      accessibilityState={{
        ...props.accessibilityState,
        disabled: inactive,
        busy: loading,
      }}
      disabled={inactive}
      onPress={() => {
        if (!inactive) onPress?.();
      }}
      style={(state) => [
        {
          minHeight: controlHeight ?? Math.max(44, nativeMetrics.control[size]),
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          justifyContent: "center",
        },
        appearance !== "unstyled" && {
          paddingHorizontal: iconOnly ? 10 : 16,
          borderRadius: nativeMetrics.radius.md,
          backgroundColor: solid
            ? intent === "neutral"
              ? colors.surface
              : foreground
            : "transparent",
          borderWidth:
            appearance === "outline" || (solid && intent === "neutral") ? 1 : 0,
          borderColor: intent === "neutral" ? colors.border : foreground,
        },
        { opacity: inactive ? 0.5 : state.pressed ? 0.8 : 1 },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={labelColor}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      {Children.map(children, (child) =>
        typeof child === "string" || typeof child === "number" ? (
          <Text style={{ color: labelColor, fontWeight: "700" }}>{child}</Text>
        ) : (
          child
        ),
      )}
    </Pressable>
  );
}
