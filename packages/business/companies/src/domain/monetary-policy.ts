import {
  convertMoney,
  currency,
  currencyCode,
  decimalScale,
  exchangeRate,
  MonetaryFailure,
  type CurrencyCode,
  type CurrencyDefinition,
  type ExchangeRateSnapshot,
  type Money,
  type MoneyConversion,
  type RoundingMode,
} from "@kontave/monetary/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import { CompanyFailure, type CompanyId } from "./index";

/** Stable profile whose commercial quantization behavior is compatible with existing consumers. */
export const COMPANY_MONETARY_ROUNDING_PROFILE = "commercial_v1" as const;
export type CompanyMonetaryRoundingProfile = typeof COMPANY_MONETARY_ROUNDING_PROFILE;

/** Source of business exchange rates admitted by the initial company policy. */
export const COMPANY_MONETARY_RATE_SOURCE = "bcv" as const;
export type CompanyMonetaryRateSource = typeof COMPANY_MONETARY_RATE_SOURCE;

/** Immutable configuration revision for one organization-scoped company. */
export interface CompanyMonetaryPolicy {
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly version: number;
  readonly operatingCurrency: CurrencyDefinition;
  readonly referenceCurrencies: readonly CurrencyDefinition[];
  readonly rateSource: CompanyMonetaryRateSource;
  readonly roundingProfile: CompanyMonetaryRoundingProfile;
  readonly allowPreviousAvailableDate: false;
  readonly maxPreviousDays: 0;
  readonly configuredAt: string;
  readonly configuredBy: UserId;
}

/** Portable serializable policy settings accepted for a new immutable revision. */
export interface CompanyMonetaryPolicySettings {
  readonly operatingCurrencyCode: CurrencyCode;
  readonly operatingCurrencyMinorUnit: number;
  readonly referenceCurrencyCodes: readonly CurrencyCode[];
  readonly rateSource: CompanyMonetaryRateSource;
  readonly roundingProfile: CompanyMonetaryRoundingProfile;
  readonly allowPreviousAvailableDate: false;
  readonly maxPreviousDays: 0;
}

/** JSON-safe evidence necessary to reproduce a conversion after a policy changes. */
export interface CompanyMonetaryContextSnapshot {
  readonly organizationId: string;
  readonly companyId: string;
  readonly policyVersion: number;
  readonly operatingCurrency: SerializedCurrencyDefinition;
  readonly referenceCurrency: SerializedCurrencyDefinition;
  readonly roundingProfile: CompanyMonetaryRoundingProfile;
  readonly roundingMode: RoundingMode;
  readonly requestedDate: string;
  readonly effectiveDate: string;
  readonly observedAt: string;
  readonly resolution: "exact_date";
  readonly freshness: { readonly kind: "fresh"; readonly retrievedAt: string };
  readonly rate: {
    readonly baseCurrency: SerializedCurrencyDefinition;
    readonly quoteCurrency: SerializedCurrencyDefinition;
    readonly value: string;
    readonly publishedScale: number;
    readonly capturedAt: string;
    readonly source: { readonly kind: "official"; readonly authority: string; readonly reference: string | null };
  };
}

/** JSON-safe representation of a currency definition. */
export interface SerializedCurrencyDefinition {
  readonly code: string;
  readonly minorUnit: number;
}

/**
 * Validates and rehydrates a company monetary policy from trusted persistence data.
 * @param input - Persisted organization scope, immutable revision, and policy fields.
 * @returns A normalized immutable policy snapshot.
 * @throws {CompanyFailure} When configuration evidence or compatibility fields are invalid.
 */
export function companyMonetaryPolicy(input: CompanyMonetaryPolicy): CompanyMonetaryPolicy {
  const settings = companyMonetaryPolicySettings({
    operatingCurrencyCode: input.operatingCurrency.code,
    operatingCurrencyMinorUnit: input.operatingCurrency.minorUnit,
    referenceCurrencyCodes: input.referenceCurrencies.map((item) => item.code),
    rateSource: input.rateSource,
    roundingProfile: input.roundingProfile,
    allowPreviousAvailableDate: input.allowPreviousAvailableDate,
    maxPreviousDays: input.maxPreviousDays,
  });
  if (!Number.isSafeInteger(input.version) || input.version < 1) monetaryInvalid("Policy versions must be positive integers.");
  requireInstant(input.configuredAt, "The policy configuration time is invalid.");
  if (!input.configuredBy) monetaryInvalid("The policy actor is invalid.");
  return Object.freeze({
    organizationId: input.organizationId,
    companyId: input.companyId,
    version: input.version,
    operatingCurrency: currency(settings.operatingCurrencyCode, settings.operatingCurrencyMinorUnit),
    referenceCurrencies: Object.freeze(settings.referenceCurrencyCodes.map((code) => supportedCurrency(code))),
    rateSource: settings.rateSource,
    roundingProfile: settings.roundingProfile,
    allowPreviousAvailableDate: settings.allowPreviousAvailableDate,
    maxPreviousDays: settings.maxPreviousDays,
    configuredAt: input.configuredAt,
    configuredBy: input.configuredBy,
  });
}

/**
 * Validates the initial compatibility profile without accepting arbitrary business rules.
 * @param input - Untrusted settings selected for a new policy revision.
 * @returns Normalized settings with reference currencies in canonical order.
 * @throws {CompanyFailure} When a setting is outside the approved compatibility profile.
 */
export function companyMonetaryPolicySettings(input: CompanyMonetaryPolicySettings): CompanyMonetaryPolicySettings {
  if (input.operatingCurrencyCode !== currencyCode("VES") || input.operatingCurrencyMinorUnit !== 2) monetaryInvalid("The VES operating currency profile is required.");
  if (input.rateSource !== COMPANY_MONETARY_RATE_SOURCE || input.roundingProfile !== COMPANY_MONETARY_ROUNDING_PROFILE) monetaryInvalid("The monetary source or rounding profile is unsupported.");
  if (input.allowPreviousAvailableDate !== false || input.maxPreviousDays !== 0) monetaryInvalid("Previous-date exchange rates are not enabled.");
  if (input.referenceCurrencyCodes.length === 0) monetaryInvalid("At least one reference currency is required.");
  const seen = new Set(input.referenceCurrencyCodes);
  if (seen.size !== input.referenceCurrencyCodes.length) monetaryInvalid("Reference currencies must be unique.");
  input.referenceCurrencyCodes.forEach(supportedCurrency);
  return Object.freeze({ ...input, referenceCurrencyCodes: Object.freeze([...input.referenceCurrencyCodes].sort()) });
}

/**
 * Maps the approved policy profile to the explicit primitive rounding mode.
 * @param profile - Versioned company rounding profile.
 * @returns The primitive rounding mode used for exact conversions.
 * @throws {CompanyFailure} When the profile is not supported by this compatibility release.
 */
export function companyMonetaryRoundingMode(profile: CompanyMonetaryRoundingProfile): RoundingMode {
  if (profile !== COMPANY_MONETARY_ROUNDING_PROFILE) monetaryInvalid("The rounding profile is unsupported.");
  return "half_up";
}

/**
 * Serializes a resolved policy and exact exchange rate without binary number conversion.
 * @param input - Policy revision, selected reference currency, exact rate, and resolution evidence.
 * @returns A JSON-safe snapshot that can reproduce a conversion after policy changes.
 * @throws {CompanyFailure} When scope, rate direction, source, dates, precision, or compatibility rules are invalid.
 */
export function companyMonetaryContextSnapshot(input: {
  readonly policy: CompanyMonetaryPolicy;
  readonly referenceCurrency: CurrencyDefinition;
  readonly requestedDate: string;
  readonly observedAt: string;
  readonly retrievedAt: string;
  readonly rate: ExchangeRateSnapshot;
}): CompanyMonetaryContextSnapshot {
  const { policy, referenceCurrency, rate } = input;
  requireDate(input.requestedDate);
  requireInstant(input.observedAt, "The rate observation time is invalid.");
  requireInstant(input.retrievedAt, "The rate retrieval time is invalid.");
  if (!policy.referenceCurrencies.some((item) => item.code === referenceCurrency.code && item.minorUnit === referenceCurrency.minorUnit)) monetaryInvalid("The reference currency is not enabled.");
  if (rate.rate.baseCurrency.code !== referenceCurrency.code || rate.rate.quoteCurrency.code !== policy.operatingCurrency.code) monetaryInvalid("The exchange-rate direction is incompatible with the policy.");
  if (rate.source.kind !== "official") monetaryInvalid("Only official exchange rates are admitted.");
  requireDate(rate.effectiveDate);
  requireInstant(rate.capturedAt, "The rate capture time is invalid.");
  try {
    const snapshot = Object.freeze({
      organizationId: policy.organizationId,
      companyId: policy.companyId,
      policyVersion: policy.version,
      operatingCurrency: serializeCurrency(policy.operatingCurrency),
      referenceCurrency: serializeCurrency(referenceCurrency),
      roundingProfile: policy.roundingProfile,
      roundingMode: companyMonetaryRoundingMode(policy.roundingProfile),
      requestedDate: input.requestedDate,
      effectiveDate: rate.effectiveDate,
      observedAt: input.observedAt,
      resolution: "exact_date" as const,
      freshness: { kind: "fresh" as const, retrievedAt: input.retrievedAt },
      rate: { baseCurrency: serializeCurrency(rate.rate.baseCurrency), quoteCurrency: serializeCurrency(rate.rate.quoteCurrency), value: rate.rate.value, publishedScale: rate.rate.publishedScale, capturedAt: rate.capturedAt, source: { ...rate.source } },
    });
    requireCompanyMonetarySnapshot(snapshot);
    return snapshot;
  } catch (cause: unknown) {
    if (cause instanceof CompanyFailure) throw cause;
    monetaryInvalid("The monetary policy snapshot is invalid.");
  }
}

/**
 * Converts an amount through a previously resolved immutable context.
 * @param amount - Amount in the snapshot reference currency.
 * @param snapshot - Previously serialized immutable conversion evidence.
 * @returns Exact and quantized conversion result using the snapshot rounding profile.
 * @throws {CompanyFailure} When the snapshot is malformed or incompatible with the compatibility policy.
 */
export function convertWithCompanyMonetaryContext(amount: Money, snapshot: CompanyMonetaryContextSnapshot): MoneyConversion {
  try {
    requireCompanyMonetarySnapshot(snapshot);
    const parsedRate = exchangeRate({
      baseCurrency: currency(snapshot.rate.baseCurrency.code, snapshot.rate.baseCurrency.minorUnit),
      quoteCurrency: currency(snapshot.rate.quoteCurrency.code, snapshot.rate.quoteCurrency.minorUnit),
      value: snapshot.rate.value,
    });
    if (decimalScale(snapshot.rate.value) > snapshot.rate.publishedScale) monetaryInvalid("The published rate precision is invalid.");
    const rate = { ...parsedRate, publishedScale: snapshot.rate.publishedScale };
    return convertMoney({ amount, rate, roundingMode: companyMonetaryRoundingMode(snapshot.roundingProfile) });
  } catch (cause: unknown) {
    if (cause instanceof CompanyFailure) throw cause;
    if (cause instanceof MonetaryFailure) monetaryInvalid("The monetary policy snapshot is invalid.");
    monetaryInvalid("The monetary policy snapshot is invalid.");
  }
}

function supportedCurrency(code: CurrencyCode): CurrencyDefinition {
  if (code === currencyCode("USD") || code === currencyCode("EUR")) return currency(code, 2);
  monetaryInvalid("The currency is unsupported.");
}
function serializeCurrency(value: CurrencyDefinition): SerializedCurrencyDefinition { return { code: value.code, minorUnit: value.minorUnit }; }
function requireDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) monetaryInvalid("The business date is invalid.");
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day));
  if (parsed.toISOString().slice(0, 10) !== value) monetaryInvalid("The business date is invalid.");
}
function requireInstant(value: string, message: string): void { if (Number.isNaN(Date.parse(value))) monetaryInvalid(message); }
function monetaryInvalid(message: string): never { throw new CompanyFailure("COMPANY_MONETARY_POLICY_INVALID", message); }

function requireCompanyMonetarySnapshot(snapshot: CompanyMonetaryContextSnapshot): void {
  if (!snapshot.organizationId?.trim() || !snapshot.companyId?.trim()) monetaryInvalid("The policy scope is invalid.");
  requireDate(snapshot.requestedDate);
  requireDate(snapshot.effectiveDate);
  requireInstant(snapshot.observedAt, "The rate observation time is invalid.");
  requireInstant(snapshot.freshness.retrievedAt, "The rate retrieval time is invalid.");
  requireInstant(snapshot.rate.capturedAt, "The rate capture time is invalid.");
  if (snapshot.resolution !== "exact_date" || snapshot.freshness.kind !== "fresh" || snapshot.effectiveDate !== snapshot.requestedDate) monetaryInvalid("The rate resolution is not admissible.");
  if (snapshot.rate.source.kind !== "official" || snapshot.rate.source.authority !== "BCV") monetaryInvalid("The rate source is not admitted.");
  if (!Number.isSafeInteger(snapshot.policyVersion) || snapshot.policyVersion < 1 || snapshot.roundingProfile !== COMPANY_MONETARY_ROUNDING_PROFILE || snapshot.roundingMode !== "half_up") monetaryInvalid("The policy snapshot is invalid.");
  const reference = currency(snapshot.referenceCurrency.code, snapshot.referenceCurrency.minorUnit);
  const operating = currency(snapshot.operatingCurrency.code, snapshot.operatingCurrency.minorUnit);
  if ((reference.code !== currencyCode("USD") && reference.code !== currencyCode("EUR")) || reference.minorUnit !== 2) monetaryInvalid("The reference currency is unsupported.");
  if (operating.code !== currencyCode("VES") || operating.minorUnit !== 2 || snapshot.rate.baseCurrency.code !== reference.code || snapshot.rate.baseCurrency.minorUnit !== reference.minorUnit || snapshot.rate.quoteCurrency.code !== operating.code || snapshot.rate.quoteCurrency.minorUnit !== operating.minorUnit || !Number.isSafeInteger(snapshot.rate.publishedScale) || snapshot.rate.publishedScale < 0) monetaryInvalid("The rate snapshot is invalid.");
}
