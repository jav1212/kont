import type { ResolvedExchangeRateSet } from "@kontave/monetary-application";
import { currency, currencyCode, exchangeRate, type CurrencyCode, type CurrencyDefinition, type ExchangeRateSnapshot } from "@kontave/monetary-domain";
import {
  OperationContextFailure,
  createOperationalDefaults,
  localDate,
  unavailableExchangeRate,
  type LocalDate,
  type OperationContextKey,
  type OperationalDefaults,
} from "@kontave/operation-context-domain";

export interface OperationContextStore {
  /**
   * Loads the current snapshot for a key.
   *
   * @param key - User, organization and company scope.
   * @returns The persisted snapshot, or `null` when none exists.
   * @throws {OperationContextFailure} When persistence is unavailable or access is denied.
   */
  load(key: OperationContextKey): Promise<OperationalDefaults | null>;
  /**
   * Saves a snapshot only when the persisted version matches `expectedVersion`.
   *
   * @param value - Validated snapshot to persist.
   * @param expectedVersion - Version that must currently be stored.
   * @returns The authoritative persisted snapshot.
   * @throws {OperationContextFailure} When access, validation, availability or optimistic concurrency checks fail.
   */
  save(value: OperationalDefaults, expectedVersion: number): Promise<OperationalDefaults>;
  /**
   * Removes the persisted snapshot for a key.
   *
   * @param key - User, organization and company scope.
   * @returns Nothing after persistence confirms the removal.
   * @throws {OperationContextFailure} When persistence is unavailable or access is denied.
   */
  clear(key: OperationContextKey): Promise<void>;
}

/** Resolves official exchange rates without exposing provider details to the coordinator. */
export interface OperationExchangeRateResolver {
  /**
   * Resolves rates applicable to the requested quote currency and civil date.
   *
   * @param quoteCurrency - Currency in which the operation is presented.
   * @param date - Effective civil date encoded as `YYYY-MM-DD`.
   * @returns The provider's resolved rate set and provenance.
   * @throws A typed monetary application failure when resolution is unavailable.
   */
  historical(quoteCurrency: CurrencyDefinition, date: string): Promise<ResolvedExchangeRateSet>;
}

/** Supplies deterministic instants and civil dates to application behavior. */
export interface OperationContextClock {
  /**
   * Returns the current instant.
   *
   * @returns An ISO timestamp suitable for persisted audit metadata.
   */
  now(): string;
  /**
   * Returns the current local operational date.
   *
   * @returns The validated local date used for new defaults.
   */
  today(): LocalDate;
}

/** Observable coordinator lifecycle and failure state. */
export type OperationContextState =
  | { readonly status: "uninitialized" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: OperationalDefaults }
  | { readonly status: "changing"; readonly previous: OperationalDefaults | null }
  | { readonly status: "failed"; readonly previous: OperationalDefaults | null; readonly failure: OperationContextFailure };

/** Receives synchronous operation-context state transitions. */
export type OperationContextListener = (state: OperationContextState) => void;
/** Stops an active state subscription. */
export type Unsubscribe = () => void;

/** User-supplied rate and audit reason for an operational date. */
export interface ManualExchangeRateInput {
  readonly baseCurrency: CurrencyDefinition;
  readonly value: string;
  readonly reason: string;
}

/** Atomic changes accepted by the operation-context coordinator. */
export interface UpdateOperationContextInput {
  readonly effectiveDate?: LocalDate;
  readonly presentationCurrency?: CurrencyDefinition;
  readonly manualExchangeRate?: ManualExchangeRateInput;
}

/** Coordinates operational defaults, rate resolution and optimistic persistence. */
export class OperationContextCoordinator {
  private state: OperationContextState = { status: "uninitialized" };
  private readonly listeners = new Set<OperationContextListener>();
  private revision = 0;
  private readonly store: OperationContextStore;
  private readonly rates: OperationExchangeRateResolver;
  private readonly clock: OperationContextClock;
  private readonly defaultBaseCurrency: CurrencyDefinition;
  private readonly defaultPresentationCurrency: CurrencyDefinition;

  /**
   * Creates an operation-context coordinator with explicit ports and defaults.
   *
   * @param store - Persistence port implementing optimistic version checks.
   * @param rates - Historical exchange-rate resolver.
   * @param clock - Source of deterministic instants and civil dates.
   * @param defaultBaseCurrency - Base currency selected from resolved rate sets.
   * @param defaultPresentationCurrency - Presentation currency used for new contexts.
   */
  constructor(
    store: OperationContextStore,
    rates: OperationExchangeRateResolver,
    clock: OperationContextClock,
    defaultBaseCurrency: CurrencyDefinition = currency("USD", 2),
    defaultPresentationCurrency: CurrencyDefinition = currency("VES", 2),
  ) {
    this.store = store;
    this.rates = rates;
    this.clock = clock;
    this.defaultBaseCurrency = defaultBaseCurrency;
    this.defaultPresentationCurrency = defaultPresentationCurrency;
  }

  /**
   * Returns the current immutable lifecycle state.
   *
   * @returns The latest coordinator state.
   */
  getState(): OperationContextState { return this.state; }

  /**
   * Subscribes to synchronous state transitions and immediately emits the current state.
   *
   * @param listener - Callback receiving every subsequent state.
   * @returns A function that removes the subscription.
   */
  subscribe(listener: OperationContextListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Restores persisted defaults or creates them from the current date and official rate.
   * A newer overlapping operation supersedes this one.
   *
   * @param key - User, organization and company scope to initialize.
   * @returns A promise resolved after the winning operation reaches a terminal state; failures are published in state.
   */
  async initialize(key: OperationContextKey): Promise<void> {
    const operation = ++this.revision;
    this.publish({ status: "loading" });
    try {
      const stored = await this.store.load(key);
      if (operation !== this.revision) return;
      if (stored) { this.publish({ status: "ready", value: stored }); return; }
      await this.resolveAndSave({ key, date: this.clock.today(), currency: this.defaultPresentationCurrency, expectedVersion: 0, previous: null, operation });
    } catch (cause: unknown) {
      if (operation === this.revision) this.publish({ status: "failed", previous: null, failure: repositoryFailure(cause) });
    }
  }

  /**
   * Changes the effective date and resolves its official rate.
   *
   * @param date - New operational civil date.
   * @returns A promise resolved after persistence.
   * @throws {OperationContextFailure} When the coordinator is not ready or resolution fails.
   */
  async changeEffectiveDate(date: LocalDate): Promise<void> {
    await this.update({ effectiveDate: date });
  }

  /**
   * Changes the presentation currency and resolves its official rate.
   *
   * @param definition - New presentation-currency definition.
   * @returns A promise resolved after persistence.
   * @throws {OperationContextFailure} When the coordinator is not ready or resolution fails.
   */
  async changePresentationCurrency(definition: CurrencyDefinition): Promise<void> {
    await this.update({ presentationCurrency: definition });
  }

  /**
   * Resolves the official rate again for the current date and currency.
   *
   * @returns A promise resolved after persistence.
   * @throws {OperationContextFailure} When the coordinator is not ready or resolution fails.
   */
  async refreshExchangeRate(): Promise<void> {
    const current = this.requireReady();
    const operation = ++this.revision;
    await this.resolveAndSave({ key: current.key, date: current.effectiveDate, currency: currency(current.presentationCurrency, 2), expectedVersion: current.version, previous: current, operation });
  }

  /**
   * Selects an auditable manual rate for the current operation context.
   *
   * @param input - Manual base currency, decimal rate and audit reason.
   * @returns A promise resolved after persistence.
   * @throws {OperationContextFailure} When the coordinator is not ready or the input is invalid.
   */
  async selectManualExchangeRate(input: ManualExchangeRateInput): Promise<void> {
    await this.update({ manualExchangeRate: input });
  }

  /**
   * Applies an atomic date, currency or manual-rate change.
   *
   * @param input - Requested operational-default changes.
   * @returns A promise resolved after persistence.
   * @throws {OperationContextFailure} When the coordinator is not ready, input is invalid, or persistence fails.
   */
  async update(input: UpdateOperationContextInput): Promise<void> {
    const current = this.requireReady();
    const operation = ++this.revision;
    const date = input.effectiveDate ? localDate(input.effectiveDate) : current.effectiveDate;
    const presentation = input.presentationCurrency ?? currency(current.presentationCurrency, 2);
    if (!input.manualExchangeRate) {
      await this.resolveAndSave({ key: current.key, date, currency: presentation, expectedVersion: current.version, previous: current, operation });
      return;
    }
    this.publish({ status: "changing", previous: current });
    let candidate: OperationalDefaults;
    try {
      candidate = createOperationalDefaults({
        ...current,
        effectiveDate: date,
        presentationCurrency: presentation.code,
        version: current.version + 1,
        updatedAt: this.clock.now(),
        exchangeRate: { status: "resolved", value: {
          rate: exchangeRate({ baseCurrency: input.manualExchangeRate.baseCurrency, quoteCurrency: presentation, value: input.manualExchangeRate.value }),
          effectiveDate: date,
          capturedAt: this.clock.now(),
          source: { kind: "manual", reason: input.manualExchangeRate.reason },
        } },
      });
    } catch (cause: unknown) {
      const failure = applicationFailure(cause);
      this.publish({ status: "failed", previous: current, failure });
      throw failure;
    }
    await this.persist(candidate, current.version, current, operation);
  }

  /**
   * Changes the effective date to the clock's current operational date.
   *
   * @returns A promise resolved after rate resolution and persistence.
   * @throws {OperationContextFailure} When the coordinator is not ready or the change fails.
   */
  async resetToToday(): Promise<void> { await this.changeEffectiveDate(this.clock.today()); }

  /**
   * Reloads the current key while preserving the prior snapshot on failure.
   *
   * @returns A promise resolved after the winning reload reaches a terminal state.
   * @throws {OperationContextFailure} When the coordinator is not ready.
   */
  async refresh(): Promise<void> {
    const current = this.requireReady();
    const operation = ++this.revision;
    this.publish({ status: "loading" });
    try {
      const value = await this.store.load(current.key);
      if (operation !== this.revision) return;
      this.publish({ status: "ready", value: value ?? current });
    } catch (cause: unknown) {
      if (operation === this.revision) this.publish({ status: "failed", previous: current, failure: repositoryFailure(cause) });
    }
  }

  /**
   * Invalidates in-flight operations and resets only the in-memory lifecycle state.
   *
   * @returns Nothing after publishing the uninitialized state.
   */
  clear(): void {
    this.revision += 1;
    this.publish({ status: "uninitialized" });
  }

  private async resolveAndSave(input: {
    readonly key: OperationContextKey; readonly date: LocalDate; readonly currency: CurrencyDefinition;
    readonly expectedVersion: number; readonly previous: OperationalDefaults | null; readonly operation: number;
  }): Promise<void> {
    this.publish({ status: "changing", previous: input.previous });
    try {
      const result = await this.rates.historical(input.currency, input.date);
      if (input.operation !== this.revision) return;
      const selected = selectRate(result.rates, this.defaultBaseCurrency.code, input.currency.code);
      const candidate = createOperationalDefaults({
        key: input.key, effectiveDate: input.date, presentationCurrency: input.currency.code,
        exchangeRate: selected ? { status: "resolved", value: selected } : unavailableExchangeRate(input.date),
        version: input.expectedVersion + 1, updatedAt: this.clock.now(),
      });
      await this.persist(candidate, input.expectedVersion, input.previous, input.operation);
    } catch (cause: unknown) {
      if (input.operation !== this.revision) return;
      if (isCodedFailure(cause) && cause.code === "RATE_NOT_AVAILABLE") {
        const candidate = createOperationalDefaults({
          key: input.key, effectiveDate: input.date, presentationCurrency: input.currency.code,
          exchangeRate: unavailableExchangeRate(input.date), version: input.expectedVersion + 1, updatedAt: this.clock.now(),
        });
        await this.persist(candidate, input.expectedVersion, input.previous, input.operation);
        return;
      }
      const failure = applicationFailure(cause);
      this.publish({ status: "failed", previous: input.previous, failure });
      throw failure;
    }
  }

  private async persist(candidate: OperationalDefaults, expectedVersion: number, previous: OperationalDefaults | null, operation: number): Promise<void> {
    try {
      const saved = await this.store.save(candidate, expectedVersion);
      if (operation === this.revision) this.publish({ status: "ready", value: saved });
    } catch (cause: unknown) {
      if (operation !== this.revision) return;
      const failure = repositoryFailure(cause);
      this.publish({ status: "failed", previous, failure });
      throw failure;
    }
  }

  private requireReady(): OperationalDefaults {
    if (this.state.status !== "ready") throw new OperationContextFailure("OPERATION_CONTEXT_INVALID", "Operation context is not ready.");
    return this.state.value;
  }

  private publish(state: OperationContextState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

/**
 * Selects the first snapshot matching a base and quote currency pair.
 *
 * @param rates - Candidate exchange-rate snapshots in provider priority order.
 * @param base - Required base-currency code.
 * @param quote - Required quote-currency code.
 * @returns The first matching snapshot, or `null` when none matches.
 */
export function selectRate(rates: readonly ExchangeRateSnapshot[], base: CurrencyCode, quote: CurrencyCode): ExchangeRateSnapshot | null {
  return rates.find((item) => item.rate.baseCurrency.code === base && item.rate.quoteCurrency.code === quote) ?? null;
}

function applicationFailure(cause: unknown): OperationContextFailure {
  if (cause instanceof OperationContextFailure) return cause;
  if (isCodedFailure(cause) && cause.code === "RATE_NOT_AVAILABLE") {
    return new OperationContextFailure("OPERATION_CONTEXT_RATE_UNAVAILABLE", "No exchange rate is available for the effective date.", { cause });
  }
  return new OperationContextFailure("OPERATION_CONTEXT_REPOSITORY_UNAVAILABLE", "Operation context could not resolve its exchange rate.", { cause });
}

function repositoryFailure(cause: unknown): OperationContextFailure {
  if (cause instanceof OperationContextFailure) return cause;
  return new OperationContextFailure("OPERATION_CONTEXT_REPOSITORY_UNAVAILABLE", "Operation context is unavailable.", { cause });
}

function isCodedFailure(value: unknown): value is { readonly code: string } {
  return typeof value === "object" && value !== null && "code" in value && typeof (value as { code?: unknown }).code === "string";
}

export { currencyCode };
