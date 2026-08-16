import { currencyCode, exchangeRate, type CurrencyCode, type ExchangeRateSnapshot } from "@kontave/monetary-domain";
import type { CompanyId, OrganizationId, UserId } from "@kontave/organizations-domain";

declare const localDateBrand: unique symbol;
export type LocalDate = string & { readonly [localDateBrand]: true };

export interface OperationContextKey {
  readonly userId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}

export type ExchangeRateSelection =
  | { readonly status: "resolved"; readonly value: ExchangeRateSnapshot }
  | { readonly status: "unavailable"; readonly effectiveDate: LocalDate };

export interface OperationalDefaults {
  readonly key: OperationContextKey;
  readonly effectiveDate: LocalDate;
  readonly presentationCurrency: CurrencyCode;
  readonly exchangeRate: ExchangeRateSelection;
  readonly version: number;
  readonly updatedAt: string;
}

export type OperationContextFailureCode =
  | "OPERATION_CONTEXT_INVALID"
  | "OPERATION_CONTEXT_ACCESS_DENIED"
  | "OPERATION_CONTEXT_VERSION_CONFLICT"
  | "OPERATION_CONTEXT_RATE_UNAVAILABLE"
  | "OPERATION_CONTEXT_REPOSITORY_UNAVAILABLE";

export class OperationContextFailure extends Error {
  readonly code: OperationContextFailureCode;

  constructor(code: OperationContextFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "OperationContextFailure";
  }
}

export function localDate(value: string): LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid("Effective date must use YYYY-MM-DD format.");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw invalid("Effective date is not a valid calendar date.");
  }
  return value as LocalDate;
}

export function createOperationalDefaults(input: OperationalDefaults): OperationalDefaults {
  const effectiveDate = localDate(input.effectiveDate);
  const presentationCurrency = currencyCode(input.presentationCurrency);
  if (!Number.isSafeInteger(input.version) || input.version < 0) throw invalid("Operation-context version is invalid.");
  if (Number.isNaN(Date.parse(input.updatedAt))) throw invalid("Operation-context timestamp is invalid.");
  if (!input.key.userId || !input.key.organizationId || !input.key.companyId) throw invalid("Operation-context key is invalid.");
  const selection = validateSelection(input.exchangeRate, effectiveDate, presentationCurrency);
  return Object.freeze({ ...input, effectiveDate, presentationCurrency, exchangeRate: selection, key: Object.freeze({ ...input.key }) });
}

export function unavailableExchangeRate(effectiveDate: LocalDate): ExchangeRateSelection {
  return Object.freeze({ status: "unavailable", effectiveDate });
}

function validateSelection(selection: ExchangeRateSelection, date: LocalDate, quoteCurrency: CurrencyCode): ExchangeRateSelection {
  if (selection.status === "unavailable") {
    if (localDate(selection.effectiveDate) !== date) throw invalid("Unavailable rate must match the effective date.");
    return Object.freeze({ ...selection });
  }
  const value = selection.value;
  if (localDate(value.effectiveDate) > date) throw invalid("Exchange rate cannot be newer than the effective date.");
  if (currencyCode(value.rate.quoteCurrency.code) !== quoteCurrency) throw invalid("Exchange-rate quote currency must match presentation currency.");
  if (Number.isNaN(Date.parse(value.capturedAt))) throw invalid("Exchange-rate capture timestamp is invalid.");
  const normalized: ExchangeRateSnapshot = {
    ...value,
    rate: exchangeRate({ baseCurrency: value.rate.baseCurrency, quoteCurrency: value.rate.quoteCurrency, value: value.rate.value }),
    source: value.source.kind === "manual"
      ? { kind: "manual", reason: requireReason(value.source.reason) }
      : { kind: "official", authority: value.source.authority.trim(), reference: value.source.reference },
  };
  if (normalized.source.kind === "official" && !normalized.source.authority) throw invalid("Official exchange-rate authority is required.");
  return Object.freeze({ status: "resolved", value: Object.freeze(normalized) });
}

function requireReason(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw invalid("A manual exchange rate requires a reason.");
  return normalized;
}

function invalid(message: string): OperationContextFailure {
  return new OperationContextFailure("OPERATION_CONTEXT_INVALID", message);
}
