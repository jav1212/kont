import { createClient } from "@supabase/supabase-js";
import { currency } from "@kontave/monetary/domain";
import { CreateTreasuryMoney, type TreasuryExchangeRatePort, type TreasuryValuationPolicyPort } from "@kontave/treasury/application";
import { TreasuryFailure } from "@kontave/treasury/domain";
import { createNativeExchangeRateResolver } from "@/src/client-api/v1/operation-context/operation-context-actions";

const currencyMinorUnits: Readonly<Record<string, number>> = { VES: 2, USD: 2, EUR: 2 };

/** Composes portable Treasury valuation with the server's company policy and BCV adapters.
 * @param configuration - Trusted service-role Supabase configuration.
 * @param actorId - Authenticated actor whose company-policy read is validated by its RPC.
 * @returns A server-side valuation use case that never trusts a client operational snapshot.
 * @throws {TreasuryFailure} When valuation dependencies cannot be configured.
 */
export function createTreasuryMoneyFactory(configuration: { readonly url: string; readonly serviceRoleKey: string }, actorId: string): CreateTreasuryMoney {
  const client = createClient(configuration.url, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const resolver = createNativeExchangeRateResolver();
  const ratePort: TreasuryExchangeRatePort = {
    async getRate(input) {
      if (!(input.currency in currencyMinorUnits) || input.currency === "VES") throw new TreasuryFailure("INVALID", "Treasury currency is not supported by the configured monetary policy.");
      const set = await resolver.historical(currency("VES", 2), input.asOf);
      if (set.requestedDate !== input.asOf || set.effectiveDate !== input.asOf || set.resolution !== "exact_date" || set.freshness.kind !== "fresh") {
        throw new TreasuryFailure("UNAVAILABLE", "An exact fresh exchange rate is required for this Treasury movement.");
      }
      const snapshot = set.rates.find((item) => item.rate.baseCurrency.code === input.currency && item.rate.quoteCurrency.code === "VES");
      if (!snapshot) throw new TreasuryFailure("NOT_FOUND", "No official exchange rate exists for this Treasury currency and date.");
      return snapshot;
    },
  };
  const policyPort: TreasuryValuationPolicyPort = {
    async getPolicy(input) {
      try {
        const response = await client.rpc("get_native_company_monetary_policy", {
          p_actor_user_id: actorId,
          p_organization_id: input.organizationId,
          p_company_id: input.companyId,
          p_policy_version: null,
        });
        if (response.error) throw response.error;
        const policy = decodeCompanyMonetaryPolicy(response.data);
        if (input.currency !== "VES" && !policy.referenceCurrencyCodes.includes(input.currency)) {
          throw new TreasuryFailure("INVALID", "Treasury currency is not enabled by the company monetary policy.");
        }
        return { policyVersion: String(policy.version), roundingMode: "half_up" };
      } catch (cause: unknown) {
        if (cause instanceof TreasuryFailure) throw cause;
        throw new TreasuryFailure("UNAVAILABLE", "Company monetary policy could not be resolved for Treasury.", { cause });
      }
    },
  };
  return new CreateTreasuryMoney(ratePort, policyPort);
}

function decodeCompanyMonetaryPolicy(value: unknown): { version: number; referenceCurrencyCodes: readonly string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TreasuryFailure("UNAVAILABLE", "Company monetary policy is not configured.");
  const row = value as Readonly<Record<string, unknown>>;
  const version = row.policy_version;
  const referenceCurrencyCodes = row.reference_currency_codes;
  if (!Number.isSafeInteger(version) || Number(version) < 1 || !Array.isArray(referenceCurrencyCodes)
    || referenceCurrencyCodes.some((code) => code !== "USD" && code !== "EUR")
    || new Set(referenceCurrencyCodes).size !== referenceCurrencyCodes.length
    || row.operating_currency_code !== "VES" || row.operating_currency_minor_unit !== 2
    || row.rate_source !== "bcv" || row.rounding_profile !== "commercial_v1") {
    throw new TreasuryFailure("UNAVAILABLE", "Company monetary policy response is invalid.");
  }
  return { version: Number(version), referenceCurrencyCodes: referenceCurrencyCodes as string[] };
}

/** Resolves the configured minor-unit precision for supported Treasury currencies.
 * @param currencyCode - ISO-style currency code.
 * @returns The configured minor-unit precision.
 * @throws {TreasuryFailure} When the currency is not supported.
 */
export function treasuryCurrencyMinorUnit(currencyCode: string): number {
  if (!Object.prototype.hasOwnProperty.call(currencyMinorUnits, currencyCode)) throw new TreasuryFailure("INVALID", "Treasury currency must be VES, USD or EUR until its company policy defines another currency.");
  const minorUnit = currencyMinorUnits[currencyCode];
  if (minorUnit === undefined) throw new TreasuryFailure("INVALID", "Treasury currency must be VES, USD or EUR until its company policy defines another currency.");
  return minorUnit;
}
