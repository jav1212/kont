import { convertMoney, currency, exactDecimal, moneyFromDecimal, moneyToDecimal, type ExchangeRateSnapshot } from "@kontave/monetary/domain";
import { TreasuryFailure } from "../domain/failure";
import { validateDate, type LocalDate, type TreasuryMoney } from "../domain/model";

/** Company-specific policy metadata needed to persist a reproducible Treasury valuation. */
export interface TreasuryValuationPolicy {
  readonly policyVersion: string;
  readonly roundingMode: "half_up";
}

/** Resolves an authoritative historical rate for a native Treasury currency. */
export interface TreasuryExchangeRatePort {
  /**
   * @param input - Company scope, native currency and requested valuation date.
   * @returns The authoritative rate effective on the requested date.
   * @throws {TreasuryFailure} When an exact rate is unavailable or policy resolution fails.
   */
  getRate(input: { readonly organizationId: string; readonly companyId: string; readonly currency: string; readonly asOf: LocalDate }): Promise<ExchangeRateSnapshot>;
}

/** Resolves the version of the company's valuation policy for persisted snapshots. */
export interface TreasuryValuationPolicyPort {
  /**
   * @param input - Company scope, requested native currency and valuation date.
   * @returns The effective company policy metadata.
   * @throws {TreasuryFailure} When no approved valuation policy applies.
   */
  getPolicy(input: { readonly organizationId: string; readonly companyId: string; readonly currency: string; readonly asOf: LocalDate }): Promise<TreasuryValuationPolicy>;
}

/** Input needed to build a native amount and its immutable VES valuation. */
export interface CreateTreasuryMoneyInput {
  readonly organizationId: string;
  readonly companyId: string;
  readonly amount: string;
  readonly currency: string;
  readonly minorUnit: number;
  readonly asOf: LocalDate;
}

/** Creates a Treasury amount with an authoritative, reproducible operating value. */
export class CreateTreasuryMoney {
  /**
   * @param rates - Port for resolving company-approved historical exchange rates.
   * @param policies - Port for resolving the effective company monetary policy.
   * @returns A use case configured with the company's valuation providers.
   * @throws {TreasuryFailure} When a required valuation provider is missing.
   */
  public constructor(
    private readonly rates: TreasuryExchangeRatePort,
    private readonly policies: TreasuryValuationPolicyPort,
  ) {
    if (!rates || !policies) throw new TreasuryFailure("INVALID", "Treasury valuation providers are required.");
  }

  /**
   * @param input - Native amount, currency and company valuation date.
   * @returns Exact native amount and its VES snapshot.
   * @throws {TreasuryFailure} When input, policy, currency direction or rate is invalid.
   */
  public async execute(input: CreateTreasuryMoneyInput): Promise<TreasuryMoney> {
    try {
      if (!input.organizationId.trim() || !input.companyId.trim()) throw new TreasuryFailure("INVALID", "Treasury valuation company scope is required.");
      validateDate(input.asOf, "Treasury valuation date");
      const nativeCurrency = currency(input.currency, input.minorUnit);
      if (nativeCurrency.code === "VES" && nativeCurrency.minorUnit !== 2) throw new TreasuryFailure("INVALID", "VES Treasury amounts must use two minor-unit digits.");
      const nativeAmount = moneyFromDecimal(input.amount, nativeCurrency);
      if (nativeAmount.minorAmount <= 0n) throw new TreasuryFailure("INVALID", "Treasury amount must be positive.");
      const policy = await this.policies.getPolicy({ organizationId: input.organizationId, companyId: input.companyId, currency: nativeCurrency.code, asOf: input.asOf });
      if (!policy.policyVersion.trim() || policy.roundingMode !== "half_up") throw new TreasuryFailure("INVALID", "Treasury valuation policy is invalid.");

      if (nativeCurrency.code === "VES") {
        const amount = moneyToDecimal(nativeAmount);
        return { amount, currency: "VES", operationalValue: { baseCurrency: "VES", amount, rate: exactDecimal("1"), source: "VES identity", asOf: input.asOf, policyVersion: policy.policyVersion, rounding: policy.roundingMode, minorUnit: 2 } };
      }

      const snapshot = await this.rates.getRate({ organizationId: input.organizationId, companyId: input.companyId, currency: nativeCurrency.code, asOf: input.asOf });
      if (snapshot.effectiveDate !== input.asOf || snapshot.rate.baseCurrency.code !== nativeCurrency.code || snapshot.rate.quoteCurrency.code !== "VES") {
        throw new TreasuryFailure("INVALID", "Treasury exchange rate does not match the currency and valuation date.");
      }
      const converted = convertMoney({ amount: nativeAmount, rate: snapshot.rate, roundingMode: policy.roundingMode });
      return {
        amount: moneyToDecimal(nativeAmount), currency: nativeCurrency.code,
        operationalValue: {
          baseCurrency: "VES", amount: moneyToDecimal(converted.converted), rate: snapshot.rate.value,
          source: snapshot.source.kind === "official" ? `${snapshot.source.authority}:${snapshot.source.reference ?? "official"}` : `manual:${snapshot.source.reason}`,
          asOf: snapshot.effectiveDate, policyVersion: policy.policyVersion, rounding: policy.roundingMode, minorUnit: converted.converted.currency.minorUnit,
        },
      };
    } catch (cause: unknown) {
      if (cause instanceof TreasuryFailure) throw cause;
      throw new TreasuryFailure("INVALID", "Treasury monetary valuation could not be created.", { cause });
    }
  }
}
