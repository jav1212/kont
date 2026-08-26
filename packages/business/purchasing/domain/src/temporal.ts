import { PurchasingFailure } from "./purchasing-failure";

declare const purchaseDateBrand: unique symbol;
declare const purchaseInstantBrand: unique symbol;
export type PurchaseDate = string & { readonly [purchaseDateBrand]: true };
export type PurchaseInstant = string & { readonly [purchaseInstantBrand]: true };

export function purchaseDate(value: string): PurchaseDate {
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) throw new PurchasingFailure("PURCHASING_DATE_INVALID", "Purchase date must use YYYY-MM-DD.");
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) throw new PurchasingFailure("PURCHASING_DATE_INVALID", "Purchase date is invalid.");
  return normalized as PurchaseDate;
}

export function purchaseInstant(value: string): PurchaseInstant {
  const normalized = value.trim();
  if (!normalized.includes("T") || Number.isNaN(Date.parse(normalized))) throw new PurchasingFailure("PURCHASING_DATE_INVALID", "Purchase instant is invalid.");
  return normalized as PurchaseInstant;
}
