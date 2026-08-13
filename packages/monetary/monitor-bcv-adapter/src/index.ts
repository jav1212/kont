import { ExchangeRateApplicationFailure, type CurrencyCatalog, type ExchangeRateProvider, type ExchangeRateSet } from "@kontave/monetary-application";
import { currencyCode, exchangeRate, type CurrencyDefinition, type ExchangeRateSnapshot } from "@kontave/monetary-domain";

export interface MonitorBcvConfiguration {
  readonly baseUrl: string;
  readonly timeoutMilliseconds: number;
  readonly retryAttempts: number;
  readonly historicalLookbackDays: number;
}

export interface MonitorBcvTransport { request(url: URL, signal: AbortSignal): Promise<{ readonly status: number; readonly body: string }>; }
export interface Clock { now(): Date; today(): string; }

interface MonitorEntry { readonly code: string; readonly buy: string; readonly sell: string; readonly date: string; readonly country: string | null; readonly percentageChange: string | null; }

export class MonitorBcvProvider implements ExchangeRateProvider {
  constructor(
    private readonly catalog: CurrencyCatalog,
    private readonly quoteCurrency: CurrencyDefinition,
    private readonly transport: MonitorBcvTransport = new FetchMonitorBcvTransport(),
    private readonly configuration: MonitorBcvConfiguration = defaultMonitorBcvConfiguration(),
    private readonly clock: Clock = systemClock,
  ) {}

  async getCurrentRates(input: { readonly quoteCurrency: CurrencyDefinition }): Promise<ExchangeRateSet> {
    this.requireQuote(input.quoteCurrency);
    const entries = await this.fetch("/exchange-rate");
    return this.map(entries, this.clock.today());
  }

  async getRatesForDate(input: { readonly quoteCurrency: CurrencyDefinition; readonly date: string }): Promise<ExchangeRateSet> {
    this.requireQuote(input.quoteCurrency);
    const url = new URL("/exchange-rate/list", this.configuration.baseUrl);
    url.searchParams.set("start", subtractDays(input.date, this.configuration.historicalLookbackDays));
    url.searchParams.set("end", input.date);
    return this.map(await this.fetch(url), input.date);
  }

  private async fetch(path: string | URL): Promise<readonly MonitorEntry[]> {
    const url = typeof path === "string" ? new URL(path, this.configuration.baseUrl) : path;
    let lastFailure: unknown;
    for (let attempt = 0; attempt <= this.configuration.retryAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.configuration.timeoutMilliseconds);
      try {
        const response = await this.transport.request(url, controller.signal);
        if (response.status >= 400 && response.status < 500) throw new ExchangeRateApplicationFailure("INVALID_PROVIDER_RESPONSE", `Monitor BCV returned HTTP ${response.status}.`);
        if (response.status >= 500) throw new Error(`Monitor BCV returned HTTP ${response.status}.`);
        return decodeMonitorBcvEntries(response.body);
      } catch (cause) {
        if (cause instanceof ExchangeRateApplicationFailure) throw cause;
        lastFailure = cause;
      } finally { clearTimeout(timeout); }
    }
    throw new ExchangeRateApplicationFailure("PROVIDER_UNAVAILABLE", "Monitor BCV is unavailable.", { cause: lastFailure });
  }

  private map(entries: readonly MonitorEntry[], requestedDate: string): ExchangeRateSet {
    const valid = entries.flatMap((entry): readonly { entry: MonitorEntry; currency: CurrencyDefinition; effectiveDate: string }[] => {
      try {
        const definition = this.catalog.find(currencyCode(entry.code));
        const effectiveDate = parseProviderDate(entry.date);
        return definition && entry.sell !== "" ? [{ entry, currency: definition, effectiveDate }] : [];
      } catch { return []; }
    }).filter(({ effectiveDate }) => effectiveDate <= requestedDate);
    const effectiveDate = valid.map((item) => item.effectiveDate).sort().at(-1);
    if (!effectiveDate) throw new ExchangeRateApplicationFailure("RATE_NOT_AVAILABLE", `Monitor BCV has no rates for ${requestedDate}.`);
    const capturedAt = this.clock.now().toISOString();
    const rates: ExchangeRateSnapshot[] = valid.filter((item) => item.effectiveDate === effectiveDate).map(({ entry, currency }) => ({
      rate: exchangeRate({ baseCurrency: currency, quoteCurrency: this.quoteCurrency, value: normalizeProviderDecimal(entry.sell) }),
      effectiveDate, capturedAt,
      source: { kind: "official", authority: "BCV", reference: this.configuration.baseUrl },
    }));
    return { requestedDate, effectiveDate, resolution: effectiveDate === requestedDate ? "exact_date" : "previous_available_date", observedAt: capturedAt, rates };
  }

  private requireQuote(value: CurrencyDefinition): void {
    if (value.code !== this.quoteCurrency.code || value.minorUnit !== this.quoteCurrency.minorUnit) {
      throw new ExchangeRateApplicationFailure("UNSUPPORTED_CURRENCY", `Monitor BCV adapter quotes rates in ${this.quoteCurrency.code}.`);
    }
  }
}

export class FetchMonitorBcvTransport implements MonitorBcvTransport {
  async request(url: URL, signal: AbortSignal): Promise<{ status: number; body: string }> {
    const response = await fetch(url, { signal, headers: { accept: "application/json" } });
    return { status: response.status, body: await response.text() };
  }
}

export function decodeMonitorBcvEntries(body: string): readonly MonitorEntry[] {
  try {
    // Quote rate number tokens before JSON.parse so IEEE-754 never touches authoritative decimals.
    const lossless = body.replace(/("(?:buy|sell)"\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, "$1\"$2\"");
    const data: unknown = JSON.parse(lossless);
    if (!Array.isArray(data)) throw new Error("Expected an array.");
    return data.map(decodeEntry);
  } catch (cause) {
    throw new ExchangeRateApplicationFailure("INVALID_PROVIDER_RESPONSE", "Monitor BCV returned an invalid payload.", { cause });
  }
}

function decodeEntry(value: unknown): MonitorEntry {
  if (!value || typeof value !== "object") throw new Error("Rate entry must be an object.");
  const entry = value as Record<string, unknown>;
  if (typeof entry.code !== "string" || typeof entry.date !== "string") throw new Error("Rate entry lacks code or date.");
  return { code: entry.code.trim().toUpperCase(), date: entry.date, buy: rateText(entry.buy), sell: rateText(entry.sell), country: typeof entry.country === "string" ? entry.country : null, percentageChange: typeof entry.percentageChange === "string" ? entry.percentageChange : null };
}

function rateText(value: unknown): string { if (typeof value !== "string") throw new Error("Rate must be a decimal string or number token."); return value.trim(); }
function normalizeProviderDecimal(value: string): string { return value.replace(/\s/g, "").replace(",", "."); }
function parseProviderDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error("Invalid provider date.");
  return `${match[3]}-${match[2]}-${match[1]}`;
}
function subtractDays(value: string, days: number): string { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); }
export function defaultMonitorBcvConfiguration(): MonitorBcvConfiguration { return { baseUrl: "https://api-monitor-bcv.vercel.app", timeoutMilliseconds: 5_000, retryAttempts: 1, historicalLookbackDays: 7 }; }
const systemClock: Clock = { now: () => new Date(), today: () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) };
