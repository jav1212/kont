import { PayrollFailure } from "./payroll-failure.js";

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

export const payrollDefinitionId = (value: string): PayrollDefinitionId => identifier(value, "payroll definition") as PayrollDefinitionId;
export const payrollRelationshipId = (value: string): PayrollRelationshipId => identifier(value, "payroll relationship") as PayrollRelationshipId;
export const payrollRunId = (value: string): PayrollRunId => identifier(value, "payroll run") as PayrollRunId;
export const payrollElementEntryId = (value: string): PayrollElementEntryId => identifier(value, "payroll element entry") as PayrollElementEntryId;

export function payrollElementCode(value: string): PayrollElementCode {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_.-]{1,63}$/.test(normalized)) throw new PayrollFailure("PAYROLL_IDENTIFIER_INVALID", "Payroll element code is invalid.");
  return normalized as PayrollElementCode;
}

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
