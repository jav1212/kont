import type { CompanyId } from "@kontave/companies-domain";
import type { ProductId } from "@kontave/products-domain";
import type { ProductTaxProfileId, TaxCode } from "./identifiers";
import { includesDate, rangesOverlap, taxationDate, type TaxationDate } from "./temporal";
import type { TaxTreatment } from "./tax-rule";
import { TaxationFailure } from "./taxation-failure";

export interface ProductTaxAssignment {
  readonly taxCode: TaxCode;
  readonly treatment: TaxTreatment;
  readonly effectiveFrom: TaxationDate;
  readonly effectiveTo: TaxationDate | null;
  readonly legalBasis: string;
  readonly classificationVersion: string;
}

export interface ProductTaxProfileState {
  readonly id: ProductTaxProfileId;
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly jurisdiction: string;
  readonly assignments: readonly ProductTaxAssignment[];
  readonly version: number;
}

export class ProductTaxProfile {
  readonly id: ProductTaxProfileId;
  readonly companyId: CompanyId;
  readonly productId: ProductId;
  readonly jurisdiction: string;
  readonly assignments: readonly ProductTaxAssignment[];
  readonly version: number;

  constructor(state: ProductTaxProfileState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0) throw new TaxationFailure("TAXATION_PROFILE_INVALID", "Tax profile version is invalid.");
    this.id = state.id;
    this.companyId = state.companyId;
    this.productId = state.productId;
    this.jurisdiction = required(state.jurisdiction, 16, "jurisdiction").toUpperCase();
    const assignments = state.assignments.map(validateAssignment);
    for (let index = 0; index < assignments.length; index += 1) {
      const current = assignments[index];
      if (current === undefined) continue;
      for (const candidate of assignments.slice(index + 1)) {
        if (current.taxCode === candidate.taxCode && rangesOverlap(current.effectiveFrom, current.effectiveTo, candidate.effectiveFrom, candidate.effectiveTo)) {
          throw new TaxationFailure("TAXATION_ASSIGNMENT_OVERLAP", "Product tax assignments for the same tax cannot overlap.");
        }
      }
    }
    this.assignments = Object.freeze(assignments);
    this.version = state.version;
  }

  assignmentAt(code: TaxCode, value: string): ProductTaxAssignment {
    const date = taxationDate(value);
    const assignment = this.assignments.find((candidate) => candidate.taxCode === code && includesDate(candidate.effectiveFrom, candidate.effectiveTo, date));
    if (assignment === undefined) throw new TaxationFailure("TAXATION_CLASSIFICATION_MISSING", "Product has no tax classification for the requested date.");
    return assignment;
  }
}

function validateAssignment(input: ProductTaxAssignment): ProductTaxAssignment {
  if (input.effectiveTo !== null && input.effectiveTo < input.effectiveFrom) {
    throw new TaxationFailure("TAXATION_PROFILE_INVALID", "Product tax assignment interval is invalid.");
  }
  return {
    ...input,
    legalBasis: required(input.legalBasis, 500, "legal basis"),
    classificationVersion: required(input.classificationVersion, 128, "classification version"),
  };
}

function required(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new TaxationFailure("TAXATION_PROFILE_INVALID", `Tax profile ${name} is invalid.`);
  return normalized;
}
