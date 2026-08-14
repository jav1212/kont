import { SalesFailure } from "./sales-failure.js";

declare const salesDateBrand: unique symbol;
declare const salesInstantBrand: unique symbol;
export type SalesDate = string & { readonly [salesDateBrand]: true };
export type SalesInstant = string & { readonly [salesInstantBrand]: true };

export function salesDate(value: string): SalesDate {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new SalesFailure("SALES_DATE_INVALID", "Sales date must use YYYY-MM-DD.");
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) throw new SalesFailure("SALES_DATE_INVALID", "Sales date is invalid.");
  return normalized as SalesDate;
}

export function salesInstant(value: string): SalesInstant {
  const normalized = value.trim();
  if (!normalized.includes("T") || Number.isNaN(Date.parse(normalized))) throw new SalesFailure("SALES_DATE_INVALID", "Sales instant is invalid.");
  return normalized as SalesInstant;
}
