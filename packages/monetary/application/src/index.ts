import { currency, type CurrencyCode, type CurrencyDefinition, type ExchangeRateSnapshot } from "@kontave/monetary-domain";

export type RateResolutionKind = "exact_date" | "previous_available_date";
export type RateFreshness =
  | { readonly kind: "fresh"; readonly retrievedAt: string }
  | { readonly kind: "stale"; readonly retrievedAt: string; readonly providerFailureAt: string };

export interface ExchangeRateSet {
  readonly requestedDate: string;
  readonly effectiveDate: string;
  readonly resolution: RateResolutionKind;
  readonly observedAt: string;
  readonly rates: readonly ExchangeRateSnapshot[];
}

export interface ExchangeRateProvider {
  getCurrentRates(input: { readonly quoteCurrency: CurrencyDefinition }): Promise<ExchangeRateSet>;
  getRatesForDate(input: { readonly quoteCurrency: CurrencyDefinition; readonly date: string }): Promise<ExchangeRateSet>;
}

export interface ExchangeRateCacheEntry {
  readonly value: ExchangeRateSet;
  readonly storedAt: string;
}

export interface ExchangeRateCache {
  get(key: string): Promise<ExchangeRateCacheEntry | null>;
  put(key: string, entry: ExchangeRateCacheEntry): Promise<void>;
}

export interface ExchangeRateCachePolicy {
  readonly currentTtlMilliseconds: number;
  readonly historicalTtlMilliseconds: number;
  readonly staleIfErrorMilliseconds: number;
}

export class ExchangeRateApplicationFailure extends Error {
  constructor(
    readonly code: "PROVIDER_UNAVAILABLE" | "RATE_NOT_AVAILABLE" | "INVALID_PROVIDER_RESPONSE" | "UNSUPPORTED_CURRENCY",
    message: string,
    options?: ErrorOptions,
  ) { super(message, options); this.name = "ExchangeRateApplicationFailure"; }
}

export interface ResolvedExchangeRateSet extends ExchangeRateSet { readonly freshness: RateFreshness }

export class ResolveExchangeRates {
  constructor(
    private readonly provider: ExchangeRateProvider,
    private readonly cache: ExchangeRateCache,
    private readonly policy: ExchangeRateCachePolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  current(quoteCurrency: CurrencyDefinition): Promise<ResolvedExchangeRateSet> {
    return this.resolve(`current:${quoteCurrency.code}`, true, () => this.provider.getCurrentRates({ quoteCurrency }));
  }

  historical(quoteCurrency: CurrencyDefinition, date: string): Promise<ResolvedExchangeRateSet> {
    requireDate(date);
    return this.resolve(`historical:${quoteCurrency.code}:${date}`, false, () => this.provider.getRatesForDate({ quoteCurrency, date }));
  }

  private async resolve(key: string, current: boolean, load: () => Promise<ExchangeRateSet>): Promise<ResolvedExchangeRateSet> {
    const observedAt = this.now().toISOString();
    const cached = await this.cache.get(key);
    const age = cached ? this.now().getTime() - Date.parse(cached.storedAt) : Number.POSITIVE_INFINITY;
    const ttl = current ? this.policy.currentTtlMilliseconds : this.policy.historicalTtlMilliseconds;
    if (cached && age <= ttl) return { ...cached.value, freshness: { kind: "fresh", retrievedAt: cached.storedAt } };
    try {
      const value = await load();
      if (value.rates.length === 0) throw new ExchangeRateApplicationFailure("RATE_NOT_AVAILABLE", "No exchange rates are available.");
      await this.cache.put(key, { value, storedAt: observedAt });
      return { ...value, freshness: { kind: "fresh", retrievedAt: observedAt } };
    } catch (cause) {
      if (cached && age <= this.policy.staleIfErrorMilliseconds) {
        return { ...cached.value, freshness: { kind: "stale", retrievedAt: cached.storedAt, providerFailureAt: observedAt } };
      }
      if (cause instanceof ExchangeRateApplicationFailure) throw cause;
      throw new ExchangeRateApplicationFailure("PROVIDER_UNAVAILABLE", "Exchange-rate provider is unavailable.", { cause });
    }
  }
}

export class InMemoryExchangeRateCache implements ExchangeRateCache {
  private readonly entries = new Map<string, ExchangeRateCacheEntry>();
  async get(key: string): Promise<ExchangeRateCacheEntry | null> { return this.entries.get(key) ?? null; }
  async put(key: string, entry: ExchangeRateCacheEntry): Promise<void> { this.entries.set(key, entry); }
}

export interface CurrencyCatalog {
  find(code: CurrencyCode): CurrencyDefinition | null;
  list(): readonly CurrencyDefinition[];
}

export class FixedCurrencyCatalog implements CurrencyCatalog {
  private readonly byCode: ReadonlyMap<CurrencyCode, CurrencyDefinition>;
  constructor(definitions: readonly CurrencyDefinition[]) { this.byCode = new Map(definitions.map((item) => [item.code, item])); }
  find(code: CurrencyCode): CurrencyDefinition | null { return this.byCode.get(code) ?? null; }
  list(): readonly CurrencyDefinition[] { return [...this.byCode.values()]; }
}

/** Accepts any valid ISO-style provider code without maintaining a stale UI allowlist. */
export class IsoCurrencyCatalog implements CurrencyCatalog {
  find(code: CurrencyCode): CurrencyDefinition { return currency(code, 2); }
  list(): readonly CurrencyDefinition[] { return []; }
}

function requireDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ExchangeRateApplicationFailure("INVALID_PROVIDER_RESPONSE", "Date must use YYYY-MM-DD format.");
  }
}
