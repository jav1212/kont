import { ActivityIndicator, Pressable, StyleSheet, Text as NativeText, TextInput, View, type TextInputProps, type TextProps, type ViewProps } from "react-native";
import { designTokens } from "@kontave/design-tokens";
import type { InteractiveState, UiIntent, UiSize } from "@kontave/ui-contracts";

export const nativeTheme = {
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

export function Screen({ children, style, ...props }: ViewProps): React.JSX.Element {
  return <View {...props} style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style, ...props }: ViewProps): React.JSX.Element {
  return <View {...props} style={[styles.card, style]}>{children}</View>;
}

export function Text({ children, style, ...props }: TextProps): React.JSX.Element {
  return <NativeText {...props} style={[styles.text, style]}>{children}</NativeText>;
}

export function Heading({ children, style, ...props }: TextProps): React.JSX.Element {
  return <NativeText accessibilityRole="header" {...props} style={[styles.heading, style]}>{children}</NativeText>;
}

export function Button({ label, onPress, intent = "primary", size = "md", controlHeight, disabled, loading }: InteractiveState & {
  readonly label: string; readonly onPress: () => void; readonly intent?: UiIntent; readonly size?: UiSize; readonly controlHeight?: number;
}): React.JSX.Element {
  const inactive = disabled === true || loading === true;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: inactive, busy: loading }} disabled={inactive} onPress={onPress}
    style={({ pressed }) => [styles.button, buttonSize[size], controlHeight ? { minHeight: controlHeight } : undefined, buttonIntent[intent], pressed && styles.pressed, inactive && styles.disabled]}>
    {loading ? <ActivityIndicator color={intent === "neutral" ? nativeTheme.color.text : "#FFFFFF"} /> :
      <NativeText style={[styles.buttonLabel, intent === "neutral" && styles.neutralButtonLabel]}>{label}</NativeText>}
  </Pressable>;
}

export function TextField({ label, labelAction, endAdornment, controlHeight, error, style, ...props }: TextInputProps & { readonly label: string; readonly labelAction?: React.ReactNode; readonly endAdornment?: React.ReactNode; readonly controlHeight?: number; readonly error?: string | undefined }): React.JSX.Element {
  return <View style={styles.field}>
    <View style={styles.labelRow}><NativeText style={styles.label}>{label}</NativeText>{labelAction}</View>
    <View style={[styles.inputFrame, controlHeight ? { minHeight: controlHeight } : undefined, error ? styles.inputError : undefined]}>
      <TextInput accessibilityLabel={label} placeholderTextColor={designTokens.color.neutral[400]} {...props} style={[styles.input, controlHeight ? { minHeight: controlHeight - 2 } : undefined, style]} />
      {endAdornment ? <View style={styles.inputAdornment}>{endAdornment}</View> : null}
    </View>
    {error ? <NativeText accessibilityRole="alert" style={styles.error}>{error}</NativeText> : null}
  </View>;
}

export function Alert({ children, intent = "info" }: { readonly children: React.ReactNode; readonly intent?: UiIntent }): React.JSX.Element {
  return <View accessibilityRole="alert" style={[styles.alert, { borderColor: intentColor[intent] }]}><NativeText style={styles.text}>{children}</NativeText></View>;
}

const intentColor: Record<UiIntent, string> = { primary: nativeTheme.color.primary, neutral: nativeTheme.color.border, success: nativeTheme.color.success, warning: nativeTheme.color.warning, danger: nativeTheme.color.danger, info: nativeTheme.color.info };
const buttonIntent = StyleSheet.create({ primary: { backgroundColor: nativeTheme.color.primary }, neutral: { backgroundColor: nativeTheme.color.surface, borderWidth: 1, borderColor: nativeTheme.color.border }, success: { backgroundColor: nativeTheme.color.success }, warning: { backgroundColor: nativeTheme.color.warning }, danger: { backgroundColor: nativeTheme.color.danger }, info: { backgroundColor: nativeTheme.color.info } });
const buttonSize = StyleSheet.create({ sm: { minHeight: nativeTheme.control.sm }, md: { minHeight: nativeTheme.control.md }, lg: { minHeight: nativeTheme.control.lg } });
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: nativeTheme.color.background, padding: nativeTheme.space.xl },
  card: { backgroundColor: nativeTheme.color.surface, borderColor: nativeTheme.color.border, borderRadius: nativeTheme.radius.lg, borderWidth: 1, padding: nativeTheme.space.lg },
  text: { color: nativeTheme.color.text, fontSize: 16 }, heading: { color: nativeTheme.color.text, fontSize: 30, fontWeight: "700" },
  button: { alignItems: "center", borderRadius: nativeTheme.radius.md, elevation: 2, justifyContent: "center", paddingHorizontal: nativeTheme.space.lg, shadowColor: nativeTheme.color.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 10 },
  buttonLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" }, neutralButtonLabel: { color: nativeTheme.color.text }, pressed: { opacity: 0.82 }, disabled: { opacity: 0.5 },
  field: { gap: nativeTheme.space.sm }, labelRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, label: { color: nativeTheme.color.text, fontSize: 14, fontWeight: "600" },
  inputFrame: { alignItems: "center", backgroundColor: nativeTheme.color.surface, borderColor: nativeTheme.color.border, borderRadius: nativeTheme.radius.md, borderWidth: 1, elevation: 1, flexDirection: "row", minHeight: 54, shadowColor: designTokens.color.neutral[900], shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.035, shadowRadius: 7 },
  input: { color: nativeTheme.color.text, flex: 1, fontSize: 16, minHeight: 52, paddingHorizontal: nativeTheme.space.lg }, inputAdornment: { alignItems: "center", justifyContent: "center", paddingRight: nativeTheme.space.lg },
  inputError: { borderColor: nativeTheme.color.danger }, error: { color: nativeTheme.color.danger, fontSize: 13 },
  alert: { backgroundColor: nativeTheme.color.surface, borderLeftWidth: 4, borderRadius: nativeTheme.radius.sm, padding: nativeTheme.space.md },
});
