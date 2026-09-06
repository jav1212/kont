import { View } from "react-native";
import {
  calendarDate,
  calendarValue,
  withinBounds,
} from "../../core/src/calendar";
import type { DateControlProps } from "./date-control";
import { Button } from "./button";
import { Text } from "./typography";

/**
 * Edits a calendar date in Expo web without loading an unsupported native module.
 * @param props - Draft date, inclusive calendar bounds and draft-change callback.
 * @returns A labeled native-web calendar whose selection still requires confirmation.
 */
export function DateControl({
  value,
  min,
  max,
  locale,
  onChange,
}: DateControlProps) {
  const year = value.getFullYear(),
    month = value.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  const move = (offset: number) => {
    const next = new Date(year, month + offset, 1, 12);
    const candidate = calendarValue(next);
    onChange(
      min && candidate < min
        ? calendarDate(min)!
        : max && candidate > max
          ? calendarDate(max)!
          : next,
    );
  };
  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Button
          appearance="text"
          accessibilityLabel="Mes anterior"
          disabled={Boolean(
            min && calendarValue(new Date(year, month, 0, 12)) < min,
          )}
          onPress={() => move(-1)}
        >
          ‹
        </Button>
        <Text>
          {new Intl.DateTimeFormat(locale, {
            month: "long",
            year: "numeric",
          }).format(value)}
        </Text>
        <Button
          appearance="text"
          accessibilityLabel="Mes siguiente"
          disabled={Boolean(
            max && calendarValue(new Date(year, month + 1, 1, 12)) > max,
          )}
          onPress={() => move(1)}
        >
          ›
        </Button>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {Array.from({ length: count }, (_, index) => {
          const date = new Date(year, month, index + 1, 12),
            iso = calendarValue(date);
          return (
            <Button
              key={iso}
              size="sm"
              style={{ width: "13%" }}
              appearance={date.getDate() === value.getDate() ? "solid" : "text"}
              accessibilityLabel={new Intl.DateTimeFormat(locale, {
                dateStyle: "full",
              }).format(date)}
              accessibilityState={{ selected: iso === calendarValue(value) }}
              disabled={!withinBounds(iso, min, max)}
              onPress={() => onChange(date)}
            >
              {index + 1}
            </Button>
          );
        })}
      </View>
    </View>
  );
}
