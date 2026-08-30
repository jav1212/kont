import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, StyleSheet, Text as NativeText, TextInput, View, type StyleProp, type TextInputProps, type TextProps, type ViewProps, type ViewStyle } from "react-native";
import { useEffect, useState } from "react";
import { designTokens } from "@kontave/ui/tokens";
import type { FieldLoadingState, InteractiveState, SkeletonContract, UiIntent, UiSize } from "@kontave/ui/contracts";

/** Semantic React Native values derived from the portable design tokens. */
export const reactNativeTheme = {
  color: {
    background: designTokens.color.neutral[50], surface: "#FFFFFF", text: designTokens.color.neutral[900],
    muted: designTokens.color.neutral[600], border: designTokens.color.neutral[200], primary: designTokens.color.brand[500],
    brandBright: designTokens.color.brand[400], brandAccent: designTokens.color.brand.accent, brandDeep: designTokens.color.brand[800], brandInk: designTokens.color.brand[900],
    primarySoft: designTokens.color.brand[50], success: designTokens.color.status.success,
    warning: designTokens.color.status.warning, danger: designTokens.color.status.danger, info: designTokens.color.status.info,
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 12, lg: 16, full: 999 },
  control: { sm: 36, md: 44, lg: 52 },
} as const;

/**
 * Renders the standard React Native screen surface.
 *
 * @param props - Native view properties and screen content.
 * @returns A themed screen container.
 */
export function Screen({ children, style, ...props }: ViewProps): React.JSX.Element {
  return <View {...props} style={[styles.screen, style]}>{children}</View>;
}

/**
 * Renders a themed React Native card surface.
 *
 * @param props - Native view properties and card content.
 * @returns A bordered card container.
 */
export function Card({ children, style, ...props }: ViewProps): React.JSX.Element {
  return <View {...props} style={[styles.card, style]}>{children}</View>;
}

/**
 * Renders body text using the shared semantic theme.
 *
 * @param props - Native text properties and content.
 * @returns A themed React Native text element.
 */
export function Text({ children, style, ...props }: TextProps): React.JSX.Element {
  return <NativeText {...props} style={[styles.text, style]}>{children}</NativeText>;
}

/**
 * Renders an accessible themed heading.
 *
 * @param props - Native text properties and heading content.
 * @returns A React Native text element with header semantics.
 */
export function Heading({ children, style, ...props }: TextProps): React.JSX.Element {
  return <NativeText accessibilityRole="header" {...props} style={[styles.heading, style]}>{children}</NativeText>;
}

/** Properties accepted by the React Native button adapter. */
export interface ButtonProps extends InteractiveState {
  readonly label: string; readonly onPress: () => void; readonly intent?: UiIntent; readonly size?: UiSize; readonly controlHeight?: number;
}

/**
 * Renders an accessible pressable with semantic intent and busy state.
 *
 * @param props - Button label, action, appearance and interaction state.
 * @returns A themed React Native pressable.
 */
export function Button({ label, onPress, intent = "primary", size = "md", controlHeight, disabled, loading }: ButtonProps): React.JSX.Element {
  const inactive = disabled === true || loading === true;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: inactive, busy: loading }} disabled={inactive} onPress={onPress}
    style={({ pressed }) => [styles.button, buttonSize[size], controlHeight ? { minHeight: controlHeight } : undefined, buttonIntent[intent], pressed && styles.pressed, inactive && styles.disabled]}>
    {loading ? <ActivityIndicator color={intent === "neutral" ? reactNativeTheme.color.text : "#FFFFFF"} /> :
      <NativeText style={[styles.buttonLabel, intent === "neutral" && styles.neutralButtonLabel]}>{label}</NativeText>}
  </Pressable>;
}

export interface SkeletonProps extends SkeletonContract {
  readonly decorative?: boolean;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Renders a reduced-motion-aware loading placeholder.
 *
 * @param props - Placeholder dimensions, shape, semantics and style.
 * @returns An animated or static React Native placeholder.
 */
export function Skeleton({ accessibilityLabel = "Cargando", decorative = true, height, style, variant = "rectangle", width }: SkeletonProps): React.JSX.Element {
  const [opacity] = useState(() => new Animated.Value(0.42));
  useEffect(() => {
    let mounted = true;
    let animation: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted || reduceMotion) return;
      animation = Animated.loop(Animated.sequence([
        Animated.timing(opacity, { duration: 700, toValue: 0.8, useNativeDriver: true }),
        Animated.timing(opacity, { duration: 700, toValue: 0.42, useNativeDriver: true }),
      ]));
      animation.start();
    });
    return () => { mounted = false; animation?.stop(); };
  }, [opacity]);
  const defaultHeight = variant === "text" ? 14 : variant === "control" ? reactNativeTheme.control.md : undefined;
  return <Animated.View
    accessibilityElementsHidden={decorative}
    accessibilityLabel={decorative ? undefined : accessibilityLabel}
    accessibilityRole={decorative ? undefined : "progressbar"}
    style={[
      styles.skeleton,
      variant === "text" && styles.skeletonText,
      variant === "circle" && styles.skeletonCircle,
      { height: height ?? defaultHeight, opacity, width },
      style,
    ]}
  />;
}

export interface FieldSkeletonProps {
  readonly controlHeight?: number | undefined;
  readonly hint?: boolean;
  readonly label?: string;
  readonly loadingLabel?: boolean;
}

/**
 * Renders the loading representation of a labeled field.
 *
 * @param props - Field label, height and placeholder visibility options.
 * @returns An accessible group of field placeholders.
 */
export function FieldSkeleton({ controlHeight, hint = false, label, loadingLabel = false }: FieldSkeletonProps): React.JSX.Element {
  return <View accessibilityLabel={label ? `Cargando ${label}` : "Cargando campo"} accessibilityRole="progressbar" style={styles.field}>
    <View style={styles.labelRow}>
      {loadingLabel || !label ? <Skeleton height={14} variant="text" width="36%" /> : <NativeText style={styles.label}>{label}</NativeText>}
    </View>
    <Skeleton height={controlHeight ?? 54} variant="control" width="100%" />
    {hint ? <Skeleton height={12} variant="text" width="58%" /> : null}
  </View>;
}

/** Properties accepted by the React Native text-field adapter. */
export interface TextFieldProps extends TextInputProps, FieldLoadingState {
  readonly label: string;
  readonly labelAction?: React.ReactNode;
  readonly endAdornment?: React.ReactNode;
  readonly controlHeight?: number;
  readonly error?: string | undefined;
}

/**
 * Renders a labeled text input or its loading placeholder.
 *
 * @param props - Native input properties, label, adornments and field state.
 * @returns An accessible themed text field.
 */
export function TextField({ label, labelAction, endAdornment, controlHeight, error, loading = false, loadingLabel = false, style, ...props }: TextFieldProps): React.JSX.Element {
  if (loading) return <FieldSkeleton controlHeight={controlHeight} hint={Boolean(error)} label={label} loadingLabel={loadingLabel} />;
  return <View style={styles.field}>
    <View style={styles.labelRow}><NativeText style={styles.label}>{label}</NativeText>{labelAction}</View>
    <View style={[styles.inputFrame, controlHeight ? { minHeight: controlHeight } : undefined, error ? styles.inputError : undefined]}>
      <TextInput accessibilityLabel={label} placeholderTextColor={designTokens.color.neutral[400]} {...props} style={[styles.input, controlHeight ? { minHeight: controlHeight - 2 } : undefined, style]} />
      {endAdornment ? <View style={styles.inputAdornment}>{endAdornment}</View> : null}
    </View>
    {error ? <NativeText accessibilityRole="alert" style={styles.error}>{error}</NativeText> : null}
  </View>;
}

export interface CheckboxProps extends FieldLoadingState {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onValueChange: (value: boolean) => void;
  readonly value: boolean;
}

/**
 * Renders an accessible controlled checkbox or its loading placeholder.
 *
 * @param props - Current value, label, change action and interaction state.
 * @returns A themed checkbox control.
 */
export function Checkbox({ disabled = false, label, loading = false, loadingLabel = false, onValueChange, value }: CheckboxProps): React.JSX.Element {
  if (loading) return <View accessibilityLabel={`Cargando ${label}`} accessibilityRole="progressbar" style={styles.checkbox}>
    <Skeleton height={20} width={20} />
    {loadingLabel ? <Skeleton height={14} variant="text" width={112} /> : <NativeText style={styles.checkboxLabel}>{label}</NativeText>}
  </View>;
  return <Pressable accessibilityLabel={label} accessibilityRole="checkbox" accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onValueChange(!value)} style={({ pressed }) => [styles.checkbox, pressed && styles.pressed, disabled && styles.disabled]}>
    <View style={[styles.checkboxControl, value && styles.checkboxControlChecked]}>{value ? <NativeText style={styles.checkboxMark}>✓</NativeText> : null}</View>
    <NativeText style={styles.checkboxLabel}>{label}</NativeText>
  </Pressable>;
}

/** Properties accepted by the React Native alert adapter. */
export interface AlertProps {
  readonly children: React.ReactNode;
  readonly intent?: UiIntent;
}

/**
 * Renders an accessible message with semantic intent.
 *
 * @param props - Alert content and visual intent.
 * @returns A themed React Native alert surface.
 */
export function Alert({ children, intent = "info" }: AlertProps): React.JSX.Element {
  return <View accessibilityRole="alert" style={[styles.alert, { borderColor: intentColor[intent] }]}><NativeText style={styles.text}>{children}</NativeText></View>;
}

const intentColor: Record<UiIntent, string> = { primary: reactNativeTheme.color.primary, neutral: reactNativeTheme.color.border, success: reactNativeTheme.color.success, warning: reactNativeTheme.color.warning, danger: reactNativeTheme.color.danger, info: reactNativeTheme.color.info };
const buttonIntent = StyleSheet.create({ primary: { backgroundColor: reactNativeTheme.color.primary }, neutral: { backgroundColor: reactNativeTheme.color.surface, borderWidth: 1, borderColor: reactNativeTheme.color.border }, success: { backgroundColor: reactNativeTheme.color.success }, warning: { backgroundColor: reactNativeTheme.color.warning }, danger: { backgroundColor: reactNativeTheme.color.danger }, info: { backgroundColor: reactNativeTheme.color.info } });
const buttonSize = StyleSheet.create({ sm: { minHeight: reactNativeTheme.control.sm }, md: { minHeight: reactNativeTheme.control.md }, lg: { minHeight: reactNativeTheme.control.lg } });
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: reactNativeTheme.color.background, padding: reactNativeTheme.space.xl },
  card: { backgroundColor: reactNativeTheme.color.surface, borderColor: reactNativeTheme.color.border, borderRadius: reactNativeTheme.radius.lg, borderWidth: 1, padding: reactNativeTheme.space.lg },
  text: { color: reactNativeTheme.color.text, fontSize: 16 }, heading: { color: reactNativeTheme.color.text, fontSize: 30, fontWeight: "700" },
  button: { alignItems: "center", borderRadius: reactNativeTheme.radius.md, elevation: 2, justifyContent: "center", paddingHorizontal: reactNativeTheme.space.lg, shadowColor: reactNativeTheme.color.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 10 },
  buttonLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" }, neutralButtonLabel: { color: reactNativeTheme.color.text }, pressed: { opacity: 0.82 }, disabled: { opacity: 0.5 },
  field: { gap: reactNativeTheme.space.sm }, labelRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, label: { color: reactNativeTheme.color.text, fontSize: 14, fontWeight: "600" },
  inputFrame: { alignItems: "center", backgroundColor: reactNativeTheme.color.surface, borderColor: reactNativeTheme.color.border, borderRadius: reactNativeTheme.radius.md, borderWidth: 1, elevation: 1, flexDirection: "row", minHeight: 54, shadowColor: designTokens.color.neutral[900], shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.035, shadowRadius: 7 },
  input: { color: reactNativeTheme.color.text, flex: 1, fontSize: 16, minHeight: 52, paddingHorizontal: reactNativeTheme.space.lg }, inputAdornment: { alignItems: "center", justifyContent: "center", paddingRight: reactNativeTheme.space.lg },
  inputError: { borderColor: reactNativeTheme.color.danger }, error: { color: reactNativeTheme.color.danger, fontSize: 13 },
  alert: { backgroundColor: reactNativeTheme.color.surface, borderLeftWidth: 4, borderRadius: reactNativeTheme.radius.sm, padding: reactNativeTheme.space.md },
  skeleton: { backgroundColor: designTokens.color.neutral[200], borderRadius: reactNativeTheme.radius.sm, minHeight: 1, minWidth: 1 },
  skeletonText: { borderRadius: reactNativeTheme.radius.full }, skeletonCircle: { aspectRatio: 1, borderRadius: reactNativeTheme.radius.full },
  checkbox: { alignItems: "center", flexDirection: "row", gap: reactNativeTheme.space.sm, minHeight: 32 },
  checkboxControl: { alignItems: "center", backgroundColor: reactNativeTheme.color.surface, borderColor: reactNativeTheme.color.border, borderRadius: 6, borderWidth: 1, height: 20, justifyContent: "center", width: 20 },
  checkboxControlChecked: { backgroundColor: reactNativeTheme.color.primary, borderColor: reactNativeTheme.color.primary }, checkboxMark: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" }, checkboxLabel: { color: reactNativeTheme.color.text, flexShrink: 1, fontSize: 14, fontWeight: "600" },
});
