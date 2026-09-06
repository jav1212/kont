import { useState, type ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import type { OptionPickerEntry as PortableOption } from "@kontave/ui/contracts";
import {
  calendarValue,
  initialDate,
  validPeriod,
  withinBounds,
} from "../../core/src/calendar";
import { Button } from "./button";
import { TextField } from "./fields";
import { ModalSurface } from "./modal-surface";
import { DateControl } from "./date-control";
import { Text } from "./typography";
import { useUiTheme } from "./theme";

export interface OptionPickerEntry<
  T extends string = string,
> extends PortableOption<T> {
  readonly icon?: ReactNode;
}
export interface OptionPickerProps<T extends string> {
  readonly label: string;
  readonly value: T | null;
  readonly options: readonly OptionPickerEntry<T>[];
  readonly onValueChange: (value: T) => void;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Selects a supplied option with native modal interaction and optional search.
 * @param props - Controlled selection, options, search configuration and callback.
 * @returns A picker that changes only on explicit selection; unknown values stay unselected.
 */
export function OptionPicker<T extends string>({
  label,
  value,
  options,
  onValueChange,
  searchable = false,
  searchPlaceholder = "Buscar...",
  disabled = false,
  style,
}: OptionPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { colors, locale } = useUiTheme();
  const current = options.find((option) => option.value === value);
  const normalized = query.trim().toLocaleLowerCase(locale);
  const visible = options.filter((option) =>
    `${option.label} ${option.value} ${option.description ?? ""}`
      .toLocaleLowerCase(locale)
      .includes(normalized),
  );
  return (
    <>
      <Button
        appearance="outline"
        intent="neutral"
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        style={[{ paddingVertical: 10, justifyContent: "flex-start" }, style]}
      >
        {current?.icon}
        <View style={{ flex: 1 }}>
          <Text as="small" tone="muted">
            {label}
          </Text>
          <Text>{current?.label ?? "Seleccionar"}</Text>
        </View>
        <Text>⌄</Text>
      </Button>
      <ModalSurface title={label} open={open} onClose={() => setOpen(false)}>
        {searchable ? (
          <TextField
            label={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
        ) : null}
        {visible.map((option) => (
          <Button
            key={option.value}
            appearance="unstyled"
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            accessibilityState={{
              selected: option.value === value,
              checked: option.value === value,
            }}
            disabled={option.disabled ?? false}
            onPress={() => {
              onValueChange(option.value);
              setOpen(false);
            }}
            style={{
              padding: 12,
              justifyContent: "flex-start",
              borderRadius: 8,
              backgroundColor:
                option.value === value ? colors.primarySoft : "transparent",
            }}
          >
            {option.icon}
            <View style={{ flex: 1 }}>
              <Text>{option.label}</Text>
              {option.description ? (
                <Text tone="muted" as="small">
                  {option.description}
                </Text>
              ) : null}
            </View>
            {option.value === value ? <Text>✓</Text> : null}
          </Button>
        ))}
        {!visible.length ? (
          <Text accessibilityLiveRegion="polite" tone="muted">
            No hay opciones que coincidan.
          </Text>
        ) : null}
      </ModalSurface>
    </>
  );
}

export interface DatePickerProps {
  readonly label?: string;
  readonly value: string;
  readonly min?: string;
  readonly max?: string;
  readonly onValueChange: (value: string) => void;
  readonly locale?: string;
  readonly disabled?: boolean;
}
export type DatePeriodPickerProps = DatePickerProps;

/**
 * Selects a bounded calendar date without timezone conversion or premature commits.
 * @param props - ISO date, inclusive bounds, locale and controlled-value callback.
 * @returns Native date selection on iOS/Android and a native-web calendar on Expo web.
 */
export function DatePicker({
  label = "Fecha",
  value,
  min,
  max,
  onValueChange,
  locale: suppliedLocale,
  disabled = false,
}: DatePickerProps) {
  const { locale: providerLocale } = useUiTheme();
  const locale = suppliedLocale ?? providerLocale;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => initialDate(value, min, max));
  const commit = (date: Date) => {
    const candidate = calendarValue(date);
    if (withinBounds(candidate, min, max)) {
      onValueChange(candidate);
      setOpen(false);
    }
  };
  const control = (
    <DateControl
      value={draft}
      {...(min ? { min } : {})}
      {...(max ? { max } : {})}
      locale={locale}
      onChange={Platform.OS === "android" ? commit : setDraft}
      onDismiss={() => setOpen(false)}
    />
  );
  return (
    <>
      <Button
        appearance="outline"
        intent="neutral"
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setDraft(initialDate(value, min, max));
          setOpen(true);
        }}
      >
        <View style={{ flex: 1, paddingVertical: 8 }}>
          <Text as="small" tone="muted">
            {label}
          </Text>
          <Text>{value || "Seleccionar fecha"}</Text>
        </View>
        <Text>⌄</Text>
      </Button>
      {open && Platform.OS === "android" ? control : null}
      {Platform.OS !== "android" ? (
        <ModalSurface title={label} open={open} onClose={() => setOpen(false)}>
          {control}
          <Button
            disabled={!withinBounds(calendarValue(draft), min, max)}
            onPress={() => commit(draft)}
          >
            Confirmar fecha
          </Button>
        </ModalSurface>
      ) : null}
    </>
  );
}

/**
 * Selects a complete calendar month with localized labels and inclusive limits.
 * @param props - YYYY-MM selection, limits, locale and controlled-value callback.
 * @returns A native month dialog that resets its visible year on every opening.
 */
export function DatePeriodPicker({
  label = "Período",
  value,
  min,
  max,
  onValueChange,
  locale: suppliedLocale,
  disabled = false,
}: DatePeriodPickerProps) {
  const { locale: providerLocale } = useUiTheme();
  const locale = suppliedLocale ?? providerLocale;
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const openPicker = () => {
    const date = initialDate(
      validPeriod(value) ? `${value}-01` : "",
      min ? `${min}-01` : undefined,
      max ? `${max}-01` : undefined,
    );
    setYear(date.getFullYear());
    setOpen(true);
  };
  return (
    <>
      <Button
        appearance="outline"
        intent="neutral"
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={openPicker}
      >
        <View style={{ flex: 1, paddingVertical: 8 }}>
          <Text as="small" tone="muted">
            {label}
          </Text>
          <Text>{value || "Seleccionar período"}</Text>
        </View>
        <Text>⌄</Text>
      </Button>
      <ModalSurface title={label} open={open} onClose={() => setOpen(false)}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Button
            appearance="text"
            accessibilityLabel="Año anterior"
            disabled={year <= 1 || Boolean(min && `${year - 1}-12` < min)}
            onPress={() => setYear(year - 1)}
          >
            ‹
          </Button>
          <Text>{year}</Text>
          <Button
            appearance="text"
            accessibilityLabel="Año siguiente"
            disabled={year >= 9999 || Boolean(max && `${year + 1}-01` > max)}
            onPress={() => setYear(year + 1)}
          >
            ›
          </Button>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {Array.from({ length: 12 }, (_, index) => {
            const month = `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
            const title = new Intl.DateTimeFormat(locale, {
              month: "long",
            }).format(new Date(2000, index, 1));
            return (
              <Button
                key={month}
                style={{ width: "30%" }}
                appearance={month === value ? "solid" : "outline"}
                accessibilityLabel={title}
                accessibilityState={{ selected: month === value }}
                disabled={!withinBounds(month, min, max)}
                onPress={() => {
                  onValueChange(month);
                  setOpen(false);
                }}
              >
                {title}
              </Button>
            );
          })}
        </View>
      </ModalSurface>
    </>
  );
}
