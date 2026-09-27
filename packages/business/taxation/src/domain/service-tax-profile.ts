import type { CompanyId } from "@kontave/companies/domain";
import type { ServiceTaxProfileId, TaxCode } from "./identifiers";
import { includesDate, rangesOverlap, taxationDate, type TaxationDate } from "./temporal";
import type { TaxTreatment } from "./tax-rule";
import { TaxationFailure } from "./taxation-failure";

export interface ServiceTaxAssignment {
  readonly taxCode: TaxCode;
  readonly treatment: TaxTreatment;
  readonly effectiveFrom: TaxationDate;
  readonly effectiveTo: TaxationDate | null;
  readonly legalBasis: string;
  readonly classificationVersion: string;
}

export interface ServiceTaxProfileState {
  readonly id: ServiceTaxProfileId;
  readonly companyId: CompanyId;
  readonly serviceCode: string;
  readonly unitCode: string;
  readonly jurisdiction: string;
  readonly assignments: readonly ServiceTaxAssignment[];
  readonly version: number;
}

/** Company-owned, versioned tax classification for a service code. */
export class ServiceTaxProfile {
  readonly id: ServiceTaxProfileId;
  readonly companyId: CompanyId;
  readonly serviceCode: string;
  readonly unitCode: string;
  readonly jurisdiction: string;
  readonly assignments: readonly ServiceTaxAssignment[];
  readonly version: number;

  /**
   * Rehydrates and validates a service tax profile.
   * @param state - Complete persisted or newly-created profile state.
   * @returns No value; the profile is available on the constructed instance.
   * @throws {TaxationFailure} When identity, version, or assignment intervals are invalid.
   */
  constructor(state: ServiceTaxProfileState) {
    if (!Number.isSafeInteger(state.version) || state.version < 0) {
      throw new TaxationFailure("TAXATION_PROFILE_INVALID", "Service tax profile version is invalid.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.serviceCode = required(state.serviceCode, 128, "service code");
    this.unitCode = required(state.unitCode, 32, "fiscal unit code");
    this.jurisdiction = required(state.jurisdiction, 16, "jurisdiction").toUpperCase();
    const assignments = state.assignments.map(validateAssignment);
    for (let index = 0; index < assignments.length; index += 1) {
      const current = assignments[index];
      if (current === undefined) continue;
      for (const candidate of assignments.slice(index + 1)) {
        if (current.taxCode === candidate.taxCode && rangesOverlap(current.effectiveFrom, current.effectiveTo, candidate.effectiveFrom, candidate.effectiveTo)) {
          throw new TaxationFailure("TAXATION_ASSIGNMENT_OVERLAP", "Service tax assignments for the same tax cannot overlap.");
        }
      }
    }
    this.assignments = Object.freeze(assignments);
    this.version = state.version;
  }

  /**
   * Resolves the classification assignment effective on a date.
   * @param code - Tax code to resolve.
   * @param value - Effective local date in `YYYY-MM-DD` format.
   * @returns The unique matching assignment.
   * @throws {TaxationFailure} When no effective assignment exists.
   */
  assignmentAt(code: TaxCode, value: string): ServiceTaxAssignment {
    const date = taxationDate(value);
    const assignment = this.assignments.find((candidate) => candidate.taxCode === code && includesDate(candidate.effectiveFrom, candidate.effectiveTo, date));
    if (assignment === undefined) throw new TaxationFailure("TAXATION_CLASSIFICATION_MISSING", "Service has no tax classification for the requested date.");
    return assignment;
  }
}

function validateAssignment(input: ServiceTaxAssignment): ServiceTaxAssignment {
  if (input.effectiveTo !== null && input.effectiveTo < input.effectiveFrom) {
    throw new TaxationFailure("TAXATION_PROFILE_INVALID", "Service tax assignment interval is invalid.");
  }
  return {
    ...input,
    legalBasis: required(input.legalBasis, 500, "legal basis"),
    classificationVersion: required(input.classificationVersion, 128, "classification version"),
  };
}

function required(value: string, limit: number, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new TaxationFailure("TAXATION_PROFILE_INVALID", `Service tax ${name} is invalid.`);
  return normalized;
}
