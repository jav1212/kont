import { FixedCurrencyCatalog, InMemoryExchangeRateCache, ResolveExchangeRates } from "@kontave/monetary-application";
import { currency } from "@kontave/monetary-domain";
import { MonitorBcvProvider } from "@kontave/monetary-monitor-bcv-adapter";
import { OperationContextCoordinator } from "@kontave/operation-context-application";
import { localDate } from "@kontave/operation-context-domain";
import { createSupabaseOperationContextStore } from "@kontave/operation-context-supabase";

const USD = currency("USD", 2);
const VES = currency("VES", 2);
const BCV_CURRENCIES = [USD, currency("EUR", 2), currency("CNY", 2), currency("TRY", 2), currency("RUB", 2)];

export function createNativeOperationContextCoordinator(): OperationContextCoordinator {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Native operation-context infrastructure is not configured.");
  const catalog = new FixedCurrencyCatalog(BCV_CURRENCIES);
  const provider = new MonitorBcvProvider(catalog, VES);
  const rates = new ResolveExchangeRates(provider, new InMemoryExchangeRateCache(), {
    currentTtlMilliseconds: 30 * 60_000,
    historicalTtlMilliseconds: 24 * 60 * 60_000,
    staleIfErrorMilliseconds: 7 * 24 * 60 * 60_000,
  });
  const store = createSupabaseOperationContextStore({ url, serviceRoleKey });
  const clock = {
    now: () => new Date().toISOString(),
    today: () => localDate(new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date())),
  };
  return new OperationContextCoordinator(store, rates, clock, USD, VES);
}
