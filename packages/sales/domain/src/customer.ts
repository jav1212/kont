import type { CompanyId } from "@kontave/companies-domain";
import type { CustomerId } from "./identifiers";
import { SalesFailure } from "./sales-failure";

export type CustomerStatus = "active" | "inactive";
export interface CustomerState {
  readonly id: CustomerId;
  readonly companyId: CompanyId;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxIdentifier: string | null;
  readonly fiscalAddress: string | null;
  readonly status: CustomerStatus;
  readonly version: number;
}

export class Customer {
  readonly id: CustomerId;
  readonly companyId: CompanyId;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxIdentifier: string | null;
  readonly fiscalAddress: string | null;
  readonly status: CustomerStatus;
  readonly version: number;

  constructor(state: CustomerState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0) throw new SalesFailure("CUSTOMER_INVALID", "Customer version is invalid.");
    this.id = state.id;
    this.companyId = state.companyId;
    this.legalName = required(state.legalName, 200, "legal name");
    this.tradeName = optional(state.tradeName, 200);
    this.taxIdentifier = optional(state.taxIdentifier, 64)?.toUpperCase().replace(/\s+/g, "") ?? null;
    this.fiscalAddress = optional(state.fiscalAddress, 500);
    this.status = state.status;
    this.version = state.version;
  }

  assertActive(): void {
    if (this.status !== "active") throw new SalesFailure("CUSTOMER_INACTIVE", "Customer is inactive.");
  }

  deactivate(): Customer {
    this.assertActive();
    return new Customer({ ...this, status: "inactive", version: this.version + 1 });
  }
}

function required(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new SalesFailure("CUSTOMER_INVALID", `Customer ${name} is invalid.`);
  return normalized;
}
function optional(value: string | null, limit: number): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > limit) throw new SalesFailure("CUSTOMER_INVALID", "Customer optional value is invalid.");
  return normalized;
}
