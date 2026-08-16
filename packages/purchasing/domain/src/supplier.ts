import type { CompanyId } from "@kontave/companies-domain";
import type { SupplierId } from "./identifiers";
import { PurchasingFailure } from "./purchasing-failure";

export type SupplierStatus = "active" | "inactive";
export interface SupplierState {
  readonly id: SupplierId;
  readonly companyId: CompanyId;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxIdentifier: string | null;
  readonly status: SupplierStatus;
  readonly version: number;
}

export class Supplier {
  readonly id: SupplierId;
  readonly companyId: CompanyId;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxIdentifier: string | null;
  readonly status: SupplierStatus;
  readonly version: number;

  constructor(state: SupplierState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0) throw new PurchasingFailure("SUPPLIER_INVALID", "Supplier version is invalid.");
    this.id = state.id;
    this.companyId = state.companyId;
    this.legalName = required(state.legalName, 200, "legal name");
    this.tradeName = optional(state.tradeName, 200);
    this.taxIdentifier = optional(state.taxIdentifier, 64)?.toUpperCase().replace(/\s+/g, "") ?? null;
    this.status = state.status;
    this.version = state.version;
  }

  assertActive(): void {
    if (this.status !== "active") throw new PurchasingFailure("SUPPLIER_INACTIVE", "Supplier is inactive.");
  }

  deactivate(): Supplier {
    this.assertActive();
    return new Supplier({ ...this, status: "inactive", version: this.version + 1 });
  }
}

function required(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new PurchasingFailure("SUPPLIER_INVALID", `Supplier ${name} is invalid.`);
  return normalized;
}
function optional(value: string | null, limit: number): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > limit) throw new PurchasingFailure("SUPPLIER_INVALID", "Supplier optional value is invalid.");
  return normalized;
}
