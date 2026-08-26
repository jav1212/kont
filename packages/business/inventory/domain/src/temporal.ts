import { InventoryFailure } from "./inventory-failure";

declare const localDateBrand: unique symbol;
declare const instantBrand: unique symbol;
declare const inventoryMonthBrand: unique symbol;

export type LocalDate = string & { readonly [localDateBrand]: true };
export type Instant = string & { readonly [instantBrand]: true };
export type InventoryMonth = string & { readonly [inventoryMonthBrand]: true };

export function localDate(value: string): LocalDate {
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) throw new InventoryFailure("INVENTORY_DATE_INVALID", "Inventory date must use YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new InventoryFailure("INVENTORY_DATE_INVALID", "Inventory date is invalid.");
  }
  return normalized as LocalDate;
}

export function instant(value: string): Instant {
  const normalized = value.trim();
  if (!normalized.includes("T") || Number.isNaN(Date.parse(normalized))) {
    throw new InventoryFailure("INVENTORY_DATE_INVALID", "Inventory instant is invalid.");
  }
  return normalized as Instant;
}

export function inventoryMonth(value: string): InventoryMonth {
  const normalized = value.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalized)) {
    throw new InventoryFailure("INVENTORY_DATE_INVALID", "Inventory month must use YYYY-MM.");
  }
  return normalized as InventoryMonth;
}

export function monthOf(value: LocalDate): InventoryMonth {
  return inventoryMonth(value.slice(0, 7));
}
