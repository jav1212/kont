import { PayrollFailure } from "./payroll-failure";

declare const payrollDefinitionIdBrand: unique symbol;
declare const payrollRelationshipIdBrand: unique symbol;
declare const payrollRunIdBrand: unique symbol;
declare const payrollElementEntryIdBrand: unique symbol;
declare const payrollElementCodeBrand: unique symbol;
declare const payrollBalanceCodeBrand: unique symbol;

export type PayrollDefinitionId = string & { readonly [payrollDefinitionIdBrand]: true };
export type PayrollRelationshipId = string & { readonly [payrollRelationshipIdBrand]: true };
export type PayrollRunId = string & { readonly [payrollRunIdBrand]: true };
export type PayrollElementEntryId = string & { readonly [payrollElementEntryIdBrand]: true };
export type PayrollElementCode = string & { readonly [payrollElementCodeBrand]: true };
export type PayrollBalanceCode = string & { readonly [payrollBalanceCodeBrand]: true };

/**
 * Creates a validated payroll-definition identifier.
 * @param value - External identifier value to normalize.
 * @returns A branded payroll-definition identifier.
 * @throws {PayrollFailure} When the value is empty or exceeds the identifier limit.
 */
export const payrollDefinitionId = (value: string): PayrollDefinitionId =>
  identifier(value, "payroll definition") as PayrollDefinitionId;

/**
 * Creates a validated payroll-relationship identifier.
 * @param value - External identifier value to normalize.
 * @returns A branded payroll-relationship identifier.
 * @throws {PayrollFailure} When the value is empty or exceeds the identifier limit.
 */
export const payrollRelationshipId = (value: string): PayrollRelationshipId =>
  identifier(value, "payroll relationship") as PayrollRelationshipId;

/**
 * Creates a validated payroll-run identifier.
 * @param value - External identifier value to normalize.
 * @returns A branded payroll-run identifier.
 * @throws {PayrollFailure} When the value is empty or exceeds the identifier limit.
 */
export const payrollRunId = (value: string): PayrollRunId => identifier(value, "payroll run") as PayrollRunId;

/**
 * Creates a validated payroll-element-entry identifier.
 * @param value - External identifier value to normalize.
 * @returns A branded payroll-element-entry identifier.
 * @throws {PayrollFailure} When the value is empty or exceeds the identifier limit.
 */
export const payrollElementEntryId = (value: string): PayrollElementEntryId =>
  identifier(value, "payroll element entry") as PayrollElementEntryId;

/**
 * Normalizes a stable machine-readable payroll element code.
 * @param value - Candidate code.
 * @returns The uppercase branded element code.
 * @throws {PayrollFailure} When the normalized code violates the payroll code grammar.
 */
export function payrollElementCode(value: string): PayrollElementCode {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_.-]{1,63}$/.test(normalized)) throw new PayrollFailure("PAYROLL_IDENTIFIER_INVALID", "Payroll element code is invalid.");
  return normalized as PayrollElementCode;
}

/**
 * Normalizes a stable machine-readable payroll balance code.
 * @param value - Candidate code.
 * @returns The uppercase branded balance code.
 * @throws {PayrollFailure} When the normalized code violates the payroll code grammar.
 */
export function payrollBalanceCode(value: string): PayrollBalanceCode {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_.-]{1,63}$/.test(normalized)) throw new PayrollFailure("PAYROLL_IDENTIFIER_INVALID", "Payroll balance code is invalid.");
  return normalized as PayrollBalanceCode;
}

function identifier(value: string, kind: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) throw new PayrollFailure("PAYROLL_IDENTIFIER_INVALID", `${kind} identifier is invalid.`);
  return normalized;
}
