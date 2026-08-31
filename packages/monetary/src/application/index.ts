import {
  currency,
  type CurrencyCode,
  type CurrencyDefinition,
  type ExchangeRateSnapshot,
} from "../domain";

/** Describes whether a rate matched the requested date or used a prior business date. */
export type RateResolutionKind = "exact_date" | "previous_available_date";

/** Indicates whether a resolved rate came from a valid cache/provider response or stale fallback. */
export type RateFreshness =
  | { readonly kind: "fresh"; readonly retrievedAt: string }
  | { readonly kind: "stale"; readonly retrievedAt: string; readonly providerFailureAt: string };

/** Provider result containing all exchange rates effective for a resolution date. */
export interface ExchangeRateSet {
  readonly requestedDate: string;
  readonly effectiveDate: string;
  readonly resolution: RateResolutionKind;
  readonly observedAt: string;
  readonly rates: readonly ExchangeRateSnapshot[];
}

/** Outbound port for an authoritative exchange-rate provider. */
export interface ExchangeRateProvider {
  /** @returns Current rates quoted in the requested currency. */
  getCurrentRates(input: { readonly quoteCurrency: CurrencyDefinition }): Promise<ExchangeRateSet>;
  /** @returns Rates effective on or before the requested local date. */
  getRatesForDate(input: {
    readonly quoteCurrency: CurrencyDefinition;
    readonly date: string;
  }): Promise<ExchangeRateSet>;
}

/** Cached rate set and the instant at which it was stored. */
export interface ExchangeRateCacheEntry {
  readonly value: ExchangeRateSet;
  readonly storedAt: string;
}

/** Cache port owned by the monetary application layer. */
export interface ExchangeRateCache {
  /** @returns The matching entry, or `null` when absent. */
  get(key: string): Promise<ExchangeRateCacheEntry | null>;
  /** @returns A promise completed after storing the entry. */
  put(key: string, entry: ExchangeRateCacheEntry): Promise<void>;
}

/** Time-to-live policy for fresh and stale exchange-rate cache entries. */
export interface ExchangeRateCachePolicy {
  readonly currentTtlMilliseconds: number;
  readonly historicalTtlMilliseconds: number;
  readonly staleIfErrorMilliseconds: number;
}

/** Expected failure exposed by exchange-rate application operations. */
export class ExchangeRateApplicationFailure extends Error {
  /**
   * @param code - Stable machine-readable failure code.
   * @param message - Safe diagnostic message.
   * @param options - Optional underlying cause.
   */
  constructor(
    readonly code: "PROVIDER_UNAVAILABLE" | "RATE_NOT_AVAILABLE" | "INVALID_PROVIDER_RESPONSE" | "UNSUPPORTED_CURRENCY",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ExchangeRateApplicationFailure";
  }
}

/** Exchange-rate set enriched with cache freshness metadata. */
export interface ResolvedExchangeRateSet extends ExchangeRateSet {
  readonly freshness: RateFreshness;
}

/** Resolves current and historical rates with bounded fresh and stale caching. */
export class ResolveExchangeRates {
  /**
   * @param provider - Authoritative exchange-rate source.
   * @param cache - Cache used for fresh and stale fallback values.
   * @param policy - Cache lifetime policy in milliseconds.
   * @param now - Clock used for deterministic age and observation calculations.
   */
  constructor(
    private readonly provider: ExchangeRateProvider,
    private readonly cache: ExchangeRateCache,
    private readonly policy: ExchangeRateCachePolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * @param quoteCurrency - Currency in which rates must be quoted.
   * @returns A fresh or permitted stale current rate set.
   * @throws {ExchangeRateApplicationFailure} When no usable rate can be resolved.
   */
  current(quoteCurrency: CurrencyDefinition): Promise<ResolvedExchangeRateSet> {
    return this.resolve(
      `current:${quoteCurrency.code}`,
      true,
      () => this.provider.getCurrentRates({ quoteCurrency }),
    );
  }

  /**
   * @param quoteCurrency - Currency in which rates must be quoted.
   * @param date - Requested local date in `YYYY-MM-DD` format.
   * @returns A fresh or permitted stale historical rate set.
   * @throws {ExchangeRateApplicationFailure} When the date or resolution fails.
   */
  historical(quoteCurrency: CurrencyDefinition, date: string): Promise<ResolvedExchangeRateSet> {
    requireDate(date);
    return this.resolve(
      `historical:${quoteCurrency.code}:${date}`,
      false,
      () => this.provider.getRatesForDate({ quoteCurrency, date }),
    );
  }

  private async resolve(
    key: string,
    current: boolean,
    load: () => Promise<ExchangeRateSet>,
  ): Promise<ResolvedExchangeRateSet> {
    const observedAt = this.now().toISOString();
    let cached: ExchangeRateCacheEntry | null;
    try {
      cached = await this.cache.get(key);
    } catch (cause: unknown) {
      throw unavailable(cause);
    }
    const age = cached ? this.now().getTime() - Date.parse(cached.storedAt) : Number.POSITIVE_INFINITY;
    const ttl = current ? this.policy.currentTtlMilliseconds : this.policy.historicalTtlMilliseconds;
    if (cached && age <= ttl) {
      return { ...cached.value, freshness: { kind: "fresh", retrievedAt: cached.storedAt } };
    }
    try {
      const value = await load();
      if (value.rates.length === 0) {
        throw new ExchangeRateApplicationFailure("RATE_NOT_AVAILABLE", "No exchange rates are available.");
      }
      await this.cache.put(key, { value, storedAt: observedAt });
      return { ...value, freshness: { kind: "fresh", retrievedAt: observedAt } };
    } catch (cause: unknown) {
      if (cached && age <= this.policy.staleIfErrorMilliseconds) {
        return {
          ...cached.value,
          freshness: { kind: "stale", retrievedAt: cached.storedAt, providerFailureAt: observedAt },
        };
      }
      if (cause instanceof ExchangeRateApplicationFailure) throw cause;
      throw unavailable(cause);
    }
  }
}

/** Process-local exchange-rate cache intended for tests and short-lived clients. */
export class InMemoryExchangeRateCache implements ExchangeRateCache {
  private readonly entries = new Map<string, ExchangeRateCacheEntry>();

  /** {@inheritDoc ExchangeRateCache.get} */
  async get(key: string): Promise<ExchangeRateCacheEntry | null> {
    return this.entries.get(key) ?? null;
  }

  /** {@inheritDoc ExchangeRateCache.put} */
  async put(key: string, entry: ExchangeRateCacheEntry): Promise<void> {
    this.entries.set(key, entry);
  }
}

/** Read-only catalog of supported currencies. */
export interface CurrencyCatalog {
  /** @returns The definition for a code, or `null` when unsupported. */
  find(code: CurrencyCode): CurrencyDefinition | null;
  /** @returns All definitions explicitly advertised by the catalog. */
  list(): readonly CurrencyDefinition[];
}

/** Fixed currency catalog backed by immutable construction input. */
export class FixedCurrencyCatalog implements CurrencyCatalog {
  private readonly byCode: ReadonlyMap<CurrencyCode, CurrencyDefinition>;

  /** @param definitions - Currency definitions exposed by the catalog. */
  constructor(definitions: readonly CurrencyDefinition[]) {
    this.byCode = new Map(definitions.map((item) => [item.code, item]));
  }

  /** {@inheritDoc CurrencyCatalog.find} */
  find(code: CurrencyCode): CurrencyDefinition | null {
    return this.byCode.get(code) ?? null;
  }

  /** {@inheritDoc CurrencyCatalog.list} */
  list(): readonly CurrencyDefinition[] {
    return [...this.byCode.values()];
  }
}

/** Catalog accepting any syntactically valid ISO-style code with two minor units. */
export class IsoCurrencyCatalog implements CurrencyCatalog {
  /** {@inheritDoc CurrencyCatalog.find} */
  find(code: CurrencyCode): CurrencyDefinition {
    return currency(code, 2);
  }

  /** {@inheritDoc CurrencyCatalog.list} */
  list(): readonly CurrencyDefinition[] {
    return [];
  }
}

function requireDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalidDate();
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day));
  if (parsed.toISOString().slice(0, 10) !== value) throw invalidDate();
}

function invalidDate(): ExchangeRateApplicationFailure {
  return new ExchangeRateApplicationFailure("INVALID_PROVIDER_RESPONSE", "Date must use YYYY-MM-DD format.");
}

function unavailable(cause: unknown): ExchangeRateApplicationFailure {
  return new ExchangeRateApplicationFailure("PROVIDER_UNAVAILABLE", "Exchange-rate provider is unavailable.", { cause });
}
