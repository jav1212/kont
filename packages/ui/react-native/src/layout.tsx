import { View, type ViewProps } from "react-native";
import { nativeMetrics } from "@kontave/ui/tokens";
import { useUiTheme } from "./theme";

/**
 * Renders the standard full-height themed screen surface.
 * @param props - Native container props and composed screen content.
 * @returns A flexible screen container; safe-area decisions remain with its host.
 */
export function Screen({ style, ...props }: ViewProps) {
  const { colors } = useUiTheme();
  return (
    <View
      {...props}
      style={[
        {
          flex: 1,
          backgroundColor: colors.background,
          padding: nativeMetrics.space.xl,
        },
        style,
      ]}
    />
  );
}

/**
 * Groups content in a bordered, themed surface.
 * @param props - Native view props and card content.
 * @returns A card that follows provider colors.
 */
export function Card({ style, ...props }: ViewProps) {
  const { colors } = useUiTheme();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: nativeMetrics.radius.lg,
          padding: nativeMetrics.space.lg,
        },
        style,
      ]}
    />
  );
}

/**
 * Provides the common page surface without imposing navigation or scrolling.
 * @param props - Native page container props and content.
 * @returns A themed page container.
 */
export function PageShell(props: ViewProps) {
  return <Screen {...props} />;
}

/**
 * Arranges composed content vertically using the standard spacing scale.
 * @param props - Native container props and stacked content.
 * @returns A vertical stack with overridable native layout style.
 */
export function Stack({ style, ...props }: ViewProps) {
  return <View {...props} style={[{ gap: nativeMetrics.space.md }, style]} />;
}
