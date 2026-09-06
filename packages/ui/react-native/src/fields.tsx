import { forwardRef, useId, type ReactNode } from "react";
import {
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import type { FieldLoadingState } from "@kontave/ui/contracts";
import { nativeMetrics } from "@kontave/ui/tokens";
import { Button } from "./button";
import { FieldSkeleton, Skeleton } from "./skeleton";
import { useUiTheme } from "./theme";
import { Text } from "./typography";

export interface TextFieldProps
  extends Omit<TextInputProps, "value" | "onChangeText">, FieldLoadingState {
  readonly label: string;
  readonly value?: string;
  readonly onValueChange?: (value: string) => void;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly hint?: ReactNode;
  readonly labelAction?: ReactNode;
  readonly endAdornment?: ReactNode;
  readonly controlHeight?: number;
}

/**
 * Edits a controlled string with a visible label and accessible validation message.
 * @param props - Label, value/change callback, validation and native input options.
 * @param ref - Optional native input ref for focus management by the consumer.
 * @returns A labeled field or its loading placeholder; no validation rules are owned here.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(
  function TextField(
    {
      label,
      labelAction,
      endAdornment,
      error,
      hint,
      loading = false,
      loadingLabel = false,
      disabled = false,
      editable,
      onValueChange,
      controlHeight,
      style,
      ...props
    },
    ref,
  ) {
    const { colors } = useUiTheme();
    const id = useId();
    const canEdit = !disabled && editable !== false;
    if (loading)
      return (
        <FieldSkeleton
          label={label}
          loadingLabel={loadingLabel}
          hint={Boolean(hint || error)}
          controlHeight={controlHeight ?? nativeMetrics.control.md}
        />
      );
    return (
      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            nativeID={`${id}-label`}
            style={{ fontSize: 14, fontWeight: "600" }}
          >
            {label}
          </Text>
          {labelAction}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: nativeMetrics.radius.md,
            backgroundColor: colors.surface,
            opacity: canEdit ? 1 : 0.5,
          }}
        >
          <TextInput
            {...props}
            ref={ref}
            editable={canEdit}
            accessibilityLabel={props.accessibilityLabel ?? label}
            accessibilityHint={
              error ??
              (typeof hint === "string" ? hint : props.accessibilityHint)
            }
            accessibilityState={{
              ...props.accessibilityState,
              disabled: !canEdit,
            }}
            aria-invalid={Boolean(error)}
            onChangeText={(value) => {
              if (canEdit) onValueChange?.(value);
            }}
            placeholderTextColor={props.placeholderTextColor ?? colors.subtle}
            style={[
              {
                minHeight: controlHeight ?? nativeMetrics.control.md,
                flex: 1,
                paddingHorizontal: 12,
                color: colors.text,
                fontSize: 16,
              },
              style,
            ]}
          />
          {endAdornment}
        </View>
        {error ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
        ) : hint ? (
          <Text tone="muted" as="small">
            {hint}
          </Text>
        ) : null}
      </View>
    );
  },
);

export interface CheckboxProps
  extends FieldLoadingState, Omit<ViewProps, "children"> {
  readonly label: string;
  readonly checked?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly disabled?: boolean;
}

/**
 * Exposes a controlled boolean selection with checkbox semantics.
 * @param props - Label, selected/loading state and consumer callback.
 * @returns A touch-sized checkbox; busy and disabled controls never emit changes.
 */
export function Checkbox({
  label,
  checked = false,
  onCheckedChange,
  disabled = false,
  loading = false,
  loadingLabel = false,
  style,
  ...props
}: CheckboxProps) {
  const { colors } = useUiTheme();
  if (loading)
    return (
      <View
        {...props}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Cargando ${label}`}
        style={[
          { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
          style,
        ]}
      >
        <Skeleton width={20} height={20} />
        {loadingLabel ? (
          <Skeleton variant="text" width={112} />
        ) : (
          <Text>{label}</Text>
        )}
      </View>
    );
  return (
    <Button
      {...props}
      appearance="unstyled"
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ ...props.accessibilityState, checked }}
      disabled={disabled}
      onPress={() => onCheckedChange?.(!checked)}
      style={[{ justifyContent: "flex-start", gap: 8 }, style]}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderWidth: 1,
          borderColor: checked ? colors.primary : colors.border,
          backgroundColor: checked ? colors.primary : colors.surface,
          borderRadius: 5,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <Text style={{ color: colors.onPrimary, fontSize: 14 }}>✓</Text>
        ) : null}
      </View>
      <Text>{label}</Text>
    </Button>
  );
}
