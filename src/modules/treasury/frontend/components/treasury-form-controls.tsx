"use client";

import { KontaveRemoteFailure } from "@kontave/client-remote";
import { notify } from "@/src/shared/frontend/notify";
const CONTROL_CLASS = "rounded-lg border border-default-300 bg-background px-3 py-2";

/** Labeled text-like input used by Treasury forms and filters.
 * @param props - Label, controlled value, change handler, input type and whether the value is mandatory.
 * @returns A label wrapping the input.
 */
export function TreasuryInput({ label, value, onChange, type = "text", required = true, min, step }: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
  readonly required?: boolean;
  readonly min?: string;
  readonly step?: string;
}): React.JSX.Element {
  return <label className="grid gap-1 text-sm">{label}<input required={required} value={value} type={type} min={min} step={step} onChange={(event) => onChange(event.target.value)} className={CONTROL_CLASS} /></label>;
}

/** Labeled select used by Treasury forms and filters.
 * @param props - Label, controlled value, change handler, `[value, text]` options, and whether an empty choice is offered.
 * @returns A label wrapping the select; `optional` adds an empty option named by `emptyLabel`.
 */
export function TreasurySelect({ label, value, onChange, options, optional, emptyLabel = "Todos" }: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly (readonly [string, string])[];
  readonly optional?: boolean;
  readonly emptyLabel?: string;
}): React.JSX.Element {
  return <label className="grid gap-1 text-sm">{label}<select value={value} required={!optional} onChange={(event) => onChange(event.target.value)} className={CONTROL_CLASS}>{optional && <option value="">{emptyLabel}</option>}{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</select></label>;
}

/** Displays a Treasury account as its holder or name followed by its currency.
 * @param account - Cash box or bank account catalog row.
 * @returns A short human-readable account label.
 */
export function treasuryAccountLabel(account: { readonly id: string; readonly currency: string; readonly holderName?: string; readonly name?: string }): string {
  return `${account.holderName ?? account.name ?? account.id} · ${account.currency}`;
}

/** Current operational date in Venezuela, the jurisdiction of Treasury dates.
 * @returns The date as `YYYY-MM-DD`.
 */
export function treasuryToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Extracts a presentable message from an unknown failure.
 * @param cause - Caught value.
 * @param fallback - Message used when the failure carries none.
 * @returns The failure message or the fallback.
 */
export function treasuryErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** Reports a Treasury failure through the shared notification channel.
 * @param cause - Failure returned by a Treasury command or read.
 * @param fallback - Safe message when the failure has no presentable message.
 * @param key - Stable toast key used to replace repeated notifications.
 * @returns Nothing.
 */
export function notifyTreasuryFailure(cause: unknown, fallback: string, key: string): void {
  const requestId = cause instanceof KontaveRemoteFailure ? cause.requestId : null;
  notify.failure(cause, fallback, { deduplicationKey: key, eventName: "web.treasury.operation_failed", ...(requestId ? { attributes: { requestId } } : {}) });
}
