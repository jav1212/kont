import "server-only";
import type { PayablesValuationPort } from "@kontave/payables/application";
import { PayablesFailure } from "@kontave/payables/domain";
import { TreasuryFailure } from "@kontave/treasury/domain";
import { createTreasuryMoneyFactory, treasuryCurrencyMinorUnit } from "../treasury/treasury-money-factory";

/** Adapts the server's BCV and company monetary policy valuation to the payables port.
 * Payables reuses Treasury's composition so both contexts persist identical VES snapshots.
 * @param configuration - Trusted service-role Supabase configuration.
 * @param actorId - Authenticated actor whose company-policy read is validated by its RPC.
 * @returns A valuation port that resolves exact-date official rates on the server.
 * @throws Never; valuation failures are reported when the port is invoked.
 */
export function createPayablesValuation(configuration: { readonly url: string; readonly serviceRoleKey: string }, actorId: string): PayablesValuationPort {
  const money = createTreasuryMoneyFactory(configuration, actorId);
  return {
    async value(input) {
      try {
        const valued = await money.execute({ ...input, minorUnit: treasuryCurrencyMinorUnit(input.currency) });
        const snapshot = valued.operationalValue;
        return { amount: snapshot.amount, baseCurrency: "VES", rate: snapshot.rate, source: snapshot.source, effectiveDate: snapshot.asOf, policyVersion: snapshot.policyVersion, rounding: "half_up" };
      } catch (cause: unknown) {
        if (cause instanceof TreasuryFailure) {
          throw new PayablesFailure(cause.code === "UNAVAILABLE" || cause.code === "NOT_FOUND" ? "UNAVAILABLE" : "INVALID",
            cause.code === "UNAVAILABLE" || cause.code === "NOT_FOUND" ? "No hay una tasa oficial BCV exacta para la fecha de emisión." : "La moneda no está habilitada en la política monetaria de la empresa.", { cause });
        }
        throw cause;
      }
    },
  };
}
