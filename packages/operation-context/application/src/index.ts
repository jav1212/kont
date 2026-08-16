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
  load(key: OperationContextKey): Promise<OperationalDefaults | null>;
  save(value: OperationalDefaults, expectedVersion: number): Promise<OperationalDefaults>;
  clear(key: OperationContextKey): Promise<void>;
}

export interface OperationExchangeRateResolver {
  historical(quoteCurrency: CurrencyDefinition, date: string): Promise<ResolvedExchangeRateSet>;
}

export interface OperationContextClock {
  now(): string;
  today(): LocalDate;
}

export type OperationContextState =
  | { readonly status: "uninitialized" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: OperationalDefaults }
  | { readonly status: "changing"; readonly previous: OperationalDefaults | null }
  | { readonly status: "failed"; readonly previous: OperationalDefaults | null; readonly failure: OperationContextFailure };

export type OperationContextListener = (state: OperationContextState) => void;
export type Unsubscribe = () => void;

export interface ManualExchangeRateInput {
  readonly baseCurrency: CurrencyDefinition;
  readonly value: string;
  readonly reason: string;
}

export interface UpdateOperationContextInput {
  readonly effectiveDate?: LocalDate;
  readonly presentationCurrency?: CurrencyDefinition;
  readonly manualExchangeRate?: ManualExchangeRateInput;
}

export class OperationContextCoordinator {
  private state: OperationContextState = { status: "uninitialized" };
  private readonly listeners = new Set<OperationContextListener>();
  private revision = 0;
  private readonly store: OperationContextStore;
  private readonly rates: OperationExchangeRateResolver;
  private readonly clock: OperationContextClock;
  private readonly defaultBaseCurrency: CurrencyDefinition;
  private readonly defaultPresentationCurrency: CurrencyDefinition;

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

  getState(): OperationContextState { return this.state; }
  subscribe(listener: OperationContextListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

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

  async changeEffectiveDate(date: LocalDate): Promise<void> {
    await this.update({ effectiveDate: date });
  }

  async changePresentationCurrency(definition: CurrencyDefinition): Promise<void> {
    await this.update({ presentationCurrency: definition });
  }

  async refreshExchangeRate(): Promise<void> {
    const current = this.requireReady();
    const operation = ++this.revision;
    await this.resolveAndSave({ key: current.key, date: current.effectiveDate, currency: currency(current.presentationCurrency, 2), expectedVersion: current.version, previous: current, operation });
  }

  async selectManualExchangeRate(input: ManualExchangeRateInput): Promise<void> {
    await this.update({ manualExchangeRate: input });
  }

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
    const candidate = createOperationalDefaults({
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
    await this.persist(candidate, current.version, current, operation);
  }

  async resetToToday(): Promise<void> { await this.changeEffectiveDate(this.clock.today()); }

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
