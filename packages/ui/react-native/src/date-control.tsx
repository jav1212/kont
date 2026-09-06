import DateTimePicker from "@react-native-community/datetimepicker";
import { Platform } from "react-native";
import { calendarDate } from "../../core/src/calendar";
import { useUiTheme } from "./theme";

export interface DateControlProps {
  readonly value: Date;
  readonly min?: string;
  readonly max?: string;
  readonly locale: string;
  readonly onChange: (value: Date) => void;
  readonly onDismiss?: () => void;
}

/**
 * Embeds the iOS date control as an editor for an uncommitted draft.
 * @param props - Draft date, calendar bounds, locale and draft-change callback.
 * @returns The native wheel; its enclosing picker owns confirmation and dismissal.
 */
export function DateControl({
  value,
  min,
  max,
  locale,
  onChange,
  onDismiss,
}: DateControlProps) {
  const { theme } = useUiTheme();
  return (
    <DateTimePicker
      value={value}
      mode="date"
      display={Platform.OS === "ios" ? "spinner" : "default"}
      themeVariant={theme}
      locale={locale}
      {...(min && calendarDate(min) ? { minimumDate: calendarDate(min)! } : {})}
      {...(max && calendarDate(max) ? { maximumDate: calendarDate(max)! } : {})}
      onChange={(event, date) => {
        if (event.type === "set" && date) onChange(date);
        else onDismiss?.();
      }}
    />
  );
}
