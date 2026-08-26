import type { CompanyId } from "@kontave/companies/domain";
import type { CurrencyDefinition } from "@kontave/monetary-domain";
import type { PayrollDefinitionId } from "./identifiers";
import type { PayrollFrequency } from "./period";
import { PayrollFailure } from "./payroll-failure";

export interface PayrollDefinition {
  readonly id: PayrollDefinitionId; readonly companyId: CompanyId; readonly code: string; readonly name: string;
  readonly frequency: PayrollFrequency; readonly settlementCurrency: CurrencyDefinition;
  readonly workflow: { readonly approvalRequired: boolean };
}

/**
 * Validates the identity and presentation fields of a payroll definition.
 * @param input - Definition owned by a company and settlement currency.
 * @returns A normalized immutable definition copy.
 * @throws {PayrollFailure} When its code or name is invalid.
 */
export function payrollDefinition(input: PayrollDefinition): PayrollDefinition {
  const code = input.code.trim().toUpperCase(); const name = input.name.trim();
  if (!/^[A-Z][A-Z0-9_-]{1,31}$/.test(code) || !name) throw new PayrollFailure("PAYROLL_DEFINITION_INVALID", "Payroll definition is invalid.");
  return { ...input, code, name };
}
