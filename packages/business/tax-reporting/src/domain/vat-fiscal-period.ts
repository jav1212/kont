import type { TaxReportingScope } from "./tax-reporting-fact";
import { TaxReportingFailure } from "./tax-reporting-failure";

/** Company fiscal frequency that determines period key shape. */
export type VatFiscalPeriodicity = "monthly" | "fortnightly";
/** Persisted VAT fiscal-period lifecycle. */
export type VatFiscalPeriodStatus = "open" | "in_review" | "prepared" | "declared" | "paid" | "closed";
/** One audited fiscal-period transition. */
export interface VatFiscalPeriodEvent {
  readonly from: VatFiscalPeriodStatus | null;
  readonly to: VatFiscalPeriodStatus;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly reason: string | null;
  readonly idempotencyKey: string;
  readonly version: number;
  readonly declarationId: string | null;
}
/** Immutable state of one company's VAT fiscal period. */
export interface VatFiscalPeriod {
  readonly scope: TaxReportingScope;
  readonly periodicity: VatFiscalPeriodicity | null;
  readonly periodKey: string;
  readonly status: VatFiscalPeriodStatus;
  readonly version: number;
  readonly declarationId: string | null;
  readonly events: readonly VatFiscalPeriodEvent[];
  readonly pending: readonly string[];
}
/** Input for an audited lifecycle transition. */
export interface VatFiscalPeriodTransition {
  readonly to: VatFiscalPeriodStatus;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly reason?: string;
  readonly declarationId?: string;
}

/**
 * Validates and freezes a fiscal-period snapshot.
 * @param value - Candidate period snapshot.
 * @returns Immutable fiscal-period state.
 * @throws {TaxReportingFailure} When its key, scope, status, or event history is invalid.
 */
export function vatFiscalPeriod(value: VatFiscalPeriod): VatFiscalPeriod {
  const { scope, periodicity, periodKey } = value;
  if (![scope.tenantId, scope.organizationId, scope.companyId].every((part) => part.trim().length > 0)
    || (periodicity !== null && !validPeriodKey(periodicity, periodKey)) || !Number.isInteger(value.version) || value.version < 0
    || !isStatus(value.status) || (value.declarationId !== null && !value.declarationId.trim())) invalid("Fiscal period state is invalid.");
  if (value.status === "prepared" && !value.declarationId) invalid("A prepared period must reference its declaration revision.");
  return Object.freeze({ ...value, scope: Object.freeze({ ...scope }), events: Object.freeze([...value.events]), pending: Object.freeze([...value.pending]) });
}

/**
 * Starts an open VAT period with no transition history.
 * @param input - Company scope, configured frequency, and period key.
 * @returns New immutable period at version zero.
 * @throws {TaxReportingFailure} When the fiscal identity is malformed.
 */
export function openVatFiscalPeriod(input: { readonly scope: TaxReportingScope; readonly periodicity: VatFiscalPeriodicity | null; readonly periodKey: string }): VatFiscalPeriod {
  return vatFiscalPeriod({ ...input, status: "open", version: 0, declarationId: null, events: [], pending: input.periodicity === null ? ["PERIODICITY_UNCONFIGURED"] : [] });
}

/**
 * Applies a valid, version-checked period transition.
 * @param current - Persisted state to transition.
 * @param command - Actor, idempotency, expected version, and target lifecycle state.
 * @returns Updated immutable state with an appended audit event.
 * @throws {TaxReportingFailure} For invalid transitions, missing evidence, or stale versions.
 */
export function transitionVatFiscalPeriod(current: VatFiscalPeriod, command: VatFiscalPeriodTransition): VatFiscalPeriod {
  if (current.periodicity === null) throw new TaxReportingFailure("TAX_REPORTING_PERIODICITY_UNCONFIGURED", "Company VAT periodicity is not configured.");
  if (command.expectedVersion !== current.version) throw new TaxReportingFailure("TAX_REPORTING_CONCURRENCY_CONFLICT", "Fiscal period version changed; reload before retrying.");
  if (!command.actorId.trim() || !command.idempotencyKey.trim() || !Number.isFinite(Date.parse(command.occurredAt))) invalid("Fiscal period transition evidence is invalid.");
  if (current.status === command.to) {
    const previous = current.events.find((event) => event.idempotencyKey === command.idempotencyKey);
    if (previous && previous.actorId === command.actorId && previous.to === command.to) return current;
    throw new TaxReportingFailure("TAX_REPORTING_IDEMPOTENCY_CONFLICT", "Fiscal period transition key was already used.");
  }
  const reopen = command.to === "open" && ["in_review", "prepared"].includes(current.status);
  const allowed = reopen || (current.status === "open" && command.to === "in_review")
    || (current.status === "in_review" && command.to === "prepared")
    || (current.status === "prepared" && command.to === "declared")
    || (current.status === "declared" && command.to === "paid")
    || (current.status === "paid" && command.to === "closed");
  if (!allowed) throw new TaxReportingFailure("TAX_REPORTING_PERIOD_TRANSITION_INVALID", `Cannot transition ${current.status} to ${command.to}.`);
  if (reopen && !command.reason?.trim()) invalid("Reopening a fiscal period requires a reason.");
  if (command.to === "prepared" && !command.declarationId?.trim()) invalid("Preparing a fiscal period requires the current declaration revision.");
  if (command.to !== "prepared" && command.declarationId) invalid("A declaration reference is accepted only when preparing a period.");
  const version = current.version + 1;
  const event: VatFiscalPeriodEvent = Object.freeze({ from: current.status, to: command.to, actorId: command.actorId.trim(), occurredAt: command.occurredAt, reason: command.reason?.trim() || null, idempotencyKey: command.idempotencyKey.trim(), version, declarationId: command.to === "prepared" ? command.declarationId!.trim() : null });
  return vatFiscalPeriod({ ...current, status: command.to, version, declarationId: command.to === "prepared" ? command.declarationId!.trim() : current.declarationId, events: [...current.events, event] });
}
function validPeriodKey(periodicity: VatFiscalPeriodicity, key: string): boolean {
  if (periodicity === "monthly") return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  return periodicity === "fortnightly" && /^\d{4}-(0[1-9]|1[0-2])-Q[12]$/.test(key);
}
function isStatus(value: string): value is VatFiscalPeriodStatus { return ["open", "in_review", "prepared", "declared", "paid", "closed"].includes(value); }
function invalid(message: string): never { throw new TaxReportingFailure("TAX_REPORTING_INVALID", message); }
