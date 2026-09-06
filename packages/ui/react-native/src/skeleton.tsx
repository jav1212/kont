import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { SkeletonContract } from "@kontave/ui/contracts";
import { nativeMetrics } from "@kontave/ui/tokens";
import { useUiTheme } from "./theme";
import { Text } from "./typography";

export interface SkeletonProps extends SkeletonContract {
  readonly decorative?: boolean;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}
export interface FieldSkeletonProps {
  readonly label?: string;
  readonly loadingLabel?: boolean;
  readonly hint?: boolean;
  readonly controlHeight?: number;
}

/**
 * Shows a placeholder whose pulse responds to reduced-motion preferences.
 * @param props - Shape, dimensions and optional accessible loading description.
 * @returns An animated placeholder; listeners and animation stop on unmount.
 */
export function Skeleton({
  decorative = true,
  accessibilityLabel = "Cargando",
  width,
  height,
  variant = "rectangle",
  style,
}: SkeletonProps) {
  const { colors } = useUiTheme();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    let revision = 0;
    const update = (reduced: boolean) => {
      animation?.stop();
      opacity.setValue(1);
      if (reduced || !active) return;
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.4,
            duration: nativeMetrics.motion.pulse,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: nativeMetrics.motion.pulse,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
      );
      animation.start();
    };
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (reduced) => {
        revision++;
        update(reduced);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (active && revision === 0) update(reduced);
      })
      .catch(() => {
        /* Keep a static placeholder if preference lookup is unavailable. */
      });
    return () => {
      active = false;
      subscription.remove();
      animation?.stop();
    };
  }, [opacity]);
  return (
    <Animated.View
      accessible={!decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? "no-hide-descendants" : "auto"}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      accessibilityRole={decorative ? undefined : "progressbar"}
      style={[
        {
          backgroundColor: colors.border,
          opacity,
          borderRadius:
            variant === "circle" || variant === "text"
              ? nativeMetrics.radius.full
              : nativeMetrics.radius.sm,
          width,
          height:
            height ??
            (variant === "control"
              ? nativeMetrics.control.md
              : variant === "text"
                ? 14
                : 48),
        },
        variant === "circle" && { aspectRatio: 1 },
        style,
      ]}
    />
  );
}

/**
 * Preserves field layout while its label or content is loading.
 * @param props - Stable label, message placeholder and optional control height.
 * @returns One accessible loading group with decorative placeholders.
 */
export function FieldSkeleton({
  label,
  loadingLabel = false,
  hint = false,
  controlHeight,
}: FieldSkeletonProps) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ? `Cargando ${label}` : "Cargando campo"}
      style={{ gap: 8 }}
    >
      {loadingLabel || !label ? (
        <Skeleton variant="text" width="36%" />
      ) : (
        <Text>{label}</Text>
      )}
      <Skeleton
        variant="control"
        width="100%"
        height={controlHeight ?? nativeMetrics.control.md}
      />
      {hint ? <Skeleton variant="text" width="58%" /> : null}
    </View>
  );
}
