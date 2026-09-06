import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Dialog,
  DialogTrigger,
  Heading,
  I18nProvider,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  SearchField,
} from "react-aria-components";
import { parseDate } from "@internationalized/date";
import type { OptionPickerEntry as PortableOption } from "@kontave/ui/contracts";
import { themeVariables } from "@kontave/ui/tokens";
import {
  calendarDate,
  initialDate,
  validPeriod,
  withinBounds,
} from "../../core/src/calendar";
import { useUiTheme } from "./theme";
import { Text } from "./text";
import { classNames } from "./internal/class-names";

export interface OptionPickerEntry<
  TValue extends string = string,
> extends PortableOption<TValue> {
  readonly icon?: ReactNode;
}
export interface OptionPickerProps<TValue extends string> {
  readonly label: string;
  readonly value: TValue | null;
  readonly options: readonly OptionPickerEntry<TValue>[];
  readonly className?: string;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly disabled?: boolean;
  readonly onValueChange: (value: TValue) => void;
}

interface PickerPopoverProps {
  readonly label: string;
  readonly summary: ReactNode;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string | undefined;
}

function PickerPopover({
  label,
  summary,
  open,
  onOpenChange,
  children,
  disabled = false,
  className,
}: PickerPopoverProps) {
  const { theme } = useUiTheme();
  return (
    <div className={classNames("kt-context-picker", className)}>
      <DialogTrigger isOpen={open} onOpenChange={onOpenChange}>
        <AriaButton
          className="kt-context-picker__trigger"
          aria-label={label}
          isDisabled={disabled}
        >
          <Text className="kt-context-picker__copy">
            <small>{label}</small>
            <strong>{summary}</strong>
          </Text>
          <Text aria-hidden="true">⌄</Text>
        </AriaButton>
        <Popover
          className="kt-picker-popover"
          placement="bottom start"
          style={themeVariables[theme] as CSSProperties}
        >
          <Dialog aria-label={label} className="kt-picker-dialog">
            {children}
          </Dialog>
        </Popover>
      </DialogTrigger>
    </div>
  );
}

/**
 * Selects one supplied option with listbox keyboard semantics and focus restoration.
 * @param props - Controlled selection, options and optional localized search.
 * @returns A themed picker; dismissing or receiving an unknown value never commits a selection.
 */
export function OptionPicker<TValue extends string>({
  label,
  value,
  options,
  onValueChange,
  searchable = false,
  searchPlaceholder = "Buscar...",
  className,
  disabled = false,
}: OptionPickerProps<TValue>) {
  const { locale } = useUiTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const committed = useRef(false);
  const commit = (key: string | number) => {
    const option = options.find((entry) => entry.value === key);
    if (!option || option.disabled || committed.current) return;
    committed.current = true;
    if (option.value !== value) onValueChange(option.value);
    setOpen(false);
  };
  const selected = options.find((option) => option.value === value);
  const normalized = query.trim().toLocaleLowerCase(locale);
  const visible = options.filter((option) =>
    `${option.label} ${option.value} ${option.description ?? ""}`
      .toLocaleLowerCase(locale)
      .includes(normalized),
  );
  return (
    <PickerPopover
      label={label}
      summary={
        <>
          {selected?.icon}
          {selected?.label ?? "Seleccionar"}
        </>
      }
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setQuery("");
          committed.current = false;
        }
        setOpen(next);
      }}
      disabled={disabled}
      className={className}
    >
      {searchable ? (
        <SearchField
          aria-label={searchPlaceholder}
          value={query}
          onChange={setQuery}
        >
          <Input
            className="kt-field__control"
            placeholder={searchPlaceholder}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                const first = list.current?.querySelector<HTMLElement>(
                  '[role="option"]:not([aria-disabled="true"])',
                );
                first?.focus();
              }
            }}
          />
        </SearchField>
      ) : null}
      <ListBox
        ref={list}
        aria-label={label}
        className="kt-picker-options"
        selectionMode="single"
        selectionBehavior="toggle"
        disallowEmptySelection
        autoFocus={!searchable}
        items={visible}
        selectedKeys={selected ? [selected.value] : []}
        disabledKeys={options
          .filter((option) => option.disabled)
          .map((option) => option.value)}
        onSelectionChange={(selection) => {
          if (selection === "all") return;
          const key = selection.values().next().value;
          if (key !== undefined) commit(key);
        }}
        onAction={commit}
        renderEmptyState={() => (
          <Text as="p" tone="muted">
            No hay opciones que coincidan.
          </Text>
        )}
      >
        {(option) => (
          <ListBoxItem
            id={option.value}
            textValue={option.label}
            className="kt-picker-option"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit(option.value);
              }
            }}
          >
            {option.icon}
            <div>
              <Text as="strong">{option.label}</Text>
              {option.description ? (
                <Text as="small" tone="muted">
                  {option.description}
                </Text>
              ) : null}
            </div>
          </ListBoxItem>
        )}
      </ListBox>
    </PickerPopover>
  );
}

export interface DatePickerProps {
  readonly label?: string;
  readonly value: string;
  readonly max?: string;
  readonly min?: string;
  readonly className?: string;
  readonly locale?: string;
  readonly disabled?: boolean;
  readonly onValueChange: (date: string) => void;
}
export type DatePeriodPickerProps = DatePickerProps;

/**
 * Selects a bounded ISO date with accessible calendar grid interaction.
 * @param props - Controlled calendar date, inclusive limits and selection callback.
 * @returns A calendar popover; its value contains no timezone or business rules.
 */
export function DatePicker({
  label = "Fecha",
  value,
  max,
  min,
  className,
  locale: requestedLocale,
  disabled = false,
  onValueChange,
}: DatePickerProps) {
  const { locale } = useUiTheme();
  const [open, setOpen] = useState(false);
  const current = calendarDate(value);
  const summary = current
    ? new Intl.DateTimeFormat(requestedLocale ?? locale, {
        dateStyle: "medium",
      }).format(current)
    : "Seleccionar fecha";
  return (
    <PickerPopover
      label={label}
      summary={summary}
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
      className={className}
    >
      <I18nProvider locale={requestedLocale ?? locale}>
        <Calendar
          aria-label={label}
          value={current ? parseDate(value) : null}
          autoFocus
          {...(min && calendarDate(min) ? { minValue: parseDate(min) } : {})}
          {...(max && calendarDate(max) ? { maxValue: parseDate(max) } : {})}
          onChange={(date) => {
            if (withinBounds(date.toString(), min, max)) {
              onValueChange(date.toString());
              setOpen(false);
            }
          }}
        >
          <header className="kt-calendar-header">
            <AriaButton slot="previous" aria-label="Mes anterior">
              ‹
            </AriaButton>
            <Heading />
            <AriaButton slot="next" aria-label="Mes siguiente">
              ›
            </AriaButton>
          </header>
          <CalendarGrid className="kt-calendar-grid">
            <CalendarGridHeader>
              {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
            </CalendarGridHeader>
            <CalendarGridBody>
              {(date) => (
                <CalendarCell date={date} className="kt-calendar-cell" />
              )}
            </CalendarGridBody>
          </CalendarGrid>
        </Calendar>
      </I18nProvider>
    </PickerPopover>
  );
}

/**
 * Selects a localized YYYY-MM period independently of payroll or accounting state.
 * @param props - Controlled month, inclusive limits, locale and selection callback.
 * @returns A keyboard-accessible month dialog with bounded year navigation.
 */
export function DatePeriodPicker({
  label = "Período",
  value,
  min,
  max,
  className,
  locale: suppliedLocale,
  disabled = false,
  onValueChange,
}: DatePeriodPickerProps) {
  const { locale: providerLocale } = useUiTheme();
  const locale = suppliedLocale ?? providerLocale;
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const summary = validPeriod(value)
    ? new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
      }).format(calendarDate(`${value}-01`)!)
    : "Seleccionar período";
  return (
    <PickerPopover
      label={label}
      summary={summary}
      open={open}
      disabled={disabled}
      className={className}
      onOpenChange={(next) => {
        if (next)
          setYear(
            initialDate(
              validPeriod(value) ? `${value}-01` : "",
              min ? `${min}-01` : undefined,
              max ? `${max}-01` : undefined,
            ).getFullYear(),
          );
        setOpen(next);
      }}
    >
      <header className="kt-calendar-header">
        <AriaButton
          aria-label="Año anterior"
          isDisabled={year <= 1 || Boolean(min && `${year - 1}-12` < min)}
          onPress={() => setYear(year - 1)}
        >
          ‹
        </AriaButton>
        <Text as="strong">{year}</Text>
        <AriaButton
          aria-label="Año siguiente"
          isDisabled={year >= 9999 || Boolean(max && `${year + 1}-01` > max)}
          onPress={() => setYear(year + 1)}
        >
          ›
        </AriaButton>
      </header>
      <div className="kt-picker-months">
        {Array.from({ length: 12 }, (_, index) => {
          const month = `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
          const name = new Intl.DateTimeFormat(locale, {
            month: "long",
          }).format(new Date(2000, index, 1));
          return (
            <AriaButton
              key={month}
              autoFocus={month === value}
              isDisabled={!withinBounds(month, min, max)}
              aria-pressed={month === value}
              onPress={() => {
                onValueChange(month);
                setOpen(false);
              }}
            >
              {name}
            </AriaButton>
          );
        })}
      </div>
    </PickerPopover>
  );
}
