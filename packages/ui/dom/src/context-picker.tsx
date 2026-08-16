import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button.js";
import { classNames } from "./internal/class-names.js";

export interface OptionPickerEntry<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
}

export interface OptionPickerProps<TValue extends string> {
  readonly label: string;
  readonly value: TValue;
  readonly options: readonly OptionPickerEntry<TValue>[];
  readonly className?: string;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly onChange: (value: TValue) => void;
}

export function OptionPicker<TValue extends string>({ className, label, onChange, options, searchable = false, searchPlaceholder = "Buscar...", value }: OptionPickerProps<TValue>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useDismissiblePopover<HTMLDivElement>(open, () => setOpen(false));
  const selected = options.find((option) => option.value === value) ?? options[0] ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const visibleOptions = normalizedQuery
    ? options.filter((option) => `${option.label} ${option.value} ${option.description ?? ""}`.toLocaleLowerCase("es").includes(normalizedQuery))
    : options;
  const toggle = (): void => {
    if (!open) {
      setQuery("");
      if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    }
    setOpen((current) => !current);
  };
  return <div className={classNames("kt-context-picker", className)} ref={rootRef}>
    <Button appearance="unstyled" className="kt-context-picker__trigger" aria-expanded={open} aria-haspopup="listbox" onClick={toggle}>
      {selected?.icon ? <span className="kt-context-picker__icon" aria-hidden="true">{selected.icon}</span> : null}
      <span className="kt-context-picker__copy"><small>{label}</small><strong>{selected?.label ?? value}</strong></span>
      <ChevronIcon open={open} />
    </Button>
    {open ? <div className="kt-context-picker__panel" role="listbox" aria-label={label}>
      {searchable ? <label className="kt-context-picker__search"><SearchIcon /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} /></label> : null}
      <div className="kt-context-picker__options">{visibleOptions.map((option) => <Button
      appearance="unstyled"
      className="kt-context-picker__option"
      data-active={option.value === value}
      role="option"
      aria-selected={option.value === value}
      {...(option.disabled === undefined ? {} : { disabled: option.disabled })}
      key={option.value}
      onClick={() => { onChange(option.value); setOpen(false); }}
    >
      {option.icon ? <span className="kt-context-picker__option-icon" aria-hidden="true">{option.icon}</span> : null}
      <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
      {option.value === value ? <CheckIcon /> : null}
    </Button>)}{visibleOptions.length === 0 ? <p className="kt-context-picker__empty">No hay opciones que coincidan.</p> : null}</div>
    </div> : null}
  </div>;
}

export interface DatePeriodPickerProps {
  readonly label?: string;
  readonly value: string;
  readonly max?: string;
  readonly min?: string;
  readonly className?: string;
  readonly locale?: string;
  readonly onChange: (month: string) => void;
}

export function DatePeriodPicker({ className, label = "Período", locale = "es-VE", max, min, onChange, value }: DatePeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [visibleYear, setVisibleYear] = useState(() => monthParts(value).year);
  const rootRef = useDismissiblePopover<HTMLDivElement>(open, () => setOpen(false));
  const selected = monthParts(value);
  const months = Array.from({ length: 12 }, (_, index) => ({
    value: `${visibleYear}-${String(index + 1).padStart(2, "0")}`,
    label: new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, index, 1))).replace(".", ""),
  }));
  const previousDisabled = min ? `${visibleYear - 1}-12` < min : false;
  const nextDisabled = max ? `${visibleYear + 1}-01` > max : false;

  return <div className={classNames("kt-context-picker", className)} ref={rootRef}>
    <Button appearance="unstyled" className="kt-context-picker__trigger" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((current) => {
      if (!current) setVisibleYear(selected.year);
      return !current;
    })}>
      <CalendarIcon />
      <span className="kt-context-picker__copy"><small>{label}</small><strong>{formatMonth(value, locale)}</strong></span>
      <ChevronIcon open={open} />
    </Button>
    {open ? <div className="kt-date-period-picker__panel" role="dialog" aria-label={`Seleccionar ${label.toLocaleLowerCase(locale)}`}>
      <header><Button appearance="unstyled" aria-label="Año anterior" disabled={previousDisabled} onClick={() => setVisibleYear((year) => year - 1)}><ArrowIcon direction="left" /></Button><strong>{visibleYear}</strong><Button appearance="unstyled" aria-label="Año siguiente" disabled={nextDisabled} onClick={() => setVisibleYear((year) => year + 1)}><ArrowIcon direction="right" /></Button></header>
      <div className="kt-date-period-picker__months">{months.map((month) => {
        const disabled = (min ? month.value < min : false) || (max ? month.value > max : false);
        return <Button appearance="unstyled" key={month.value} disabled={disabled} data-active={month.value === value} aria-pressed={month.value === value} onClick={() => { onChange(month.value); setOpen(false); }}>{month.label}</Button>;
      })}</div>
    </div> : null}
  </div>;
}

function monthParts(value: string): { readonly year: number; readonly month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return { year: match ? Number(match[1]) : new Date().getFullYear(), month: match ? Number(match[2]) : new Date().getMonth() + 1 };
}

function formatMonth(value: string, locale: string): string {
  const { month, year } = monthParts(value);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function useDismissiblePopover<TElement extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<TElement>(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent): void => { if (!ref.current?.contains(event.target as Node)) closeRef.current(); };
    const escape = (event: KeyboardEvent): void => { if (event.key === "Escape") closeRef.current(); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  return ref;
}

function ChevronIcon({ open }: { readonly open: boolean }) { return <svg className="kt-context-picker__chevron" data-open={open} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m4.5 6 3.5 3.5L11.5 6" /></svg>; }
function CheckIcon() { return <svg className="kt-context-picker__check" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 8.5 3 3 7-7" /></svg>; }
function CalendarIcon() { return <svg className="kt-context-picker__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2.5" y="4" width="15" height="13.5" rx="2"/><path d="M6 2v4M14 2v4M2.5 8h15"/></svg>; }
function SearchIcon() { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m12.5 12.5 4 4"/></svg>; }
function ArrowIcon({ direction }: { readonly direction: "left" | "right" }) { return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={direction === "left" ? "m10 3-5 5 5 5" : "m6 3 5 5-5 5"}/></svg>; }
