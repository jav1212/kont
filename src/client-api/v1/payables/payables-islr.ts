import "server-only";
import { exactDecimal, quantizeDecimal } from "@kontave/monetary/domain";
import type { PayablesIslrCalculatorPort } from "@kontave/payables/application";
import { PayablesFailure } from "@kontave/payables/domain";
import { computeIslrRetention, getIslrConcept } from "@kontave/taxation/venezuela";

/** Adapts the shared Decreto 1.808 calculator to the payables port.
 * The rate and subtrahend come from the concept catalog; SQL recomputes the
 * amount from them, so client-supplied tariffs never reach persistence.
 * @returns A calculator that resolves the tariff for one ISLR withholding.
 * @throws Never; invalid concepts are reported when the port is invoked.
 */
export function createPayablesIslrCalculator(): PayablesIslrCalculatorPort {
  return {
    calculate(input) {
      const concept = getIslrConcept(input.conceptCode);
      if (!concept || concept.code === "001") throw new PayablesFailure("INVALID", "El concepto de ISLR no es válido para pagos a proveedores.");
      if (concept.progressiveTariff) throw new PayablesFailure("INVALID", "La tarifa progresiva de este concepto debe calcularse fuera del sistema.");
      const result = computeIslrRetention({ base: Number(input.taxableBaseVes), concept, unidadTributaria: Number(input.taxUnitValue) });
      if (result.monto <= 0) return null;
      return { rate: String(result.porcentaje), subtrahendVes: quantizeDecimal(exactDecimal(String(result.sustraendo)), { scale: 2, mode: "half_up" }) };
    },
  };
}
