import type { CompanyId } from "@kontave/companies/domain";

declare const employeeIdBrand: unique symbol;
declare const nationalIdBrand: unique symbol;

/** Stable identifier for an employee aggregate. */
export type EmployeeId = string & { readonly [employeeIdBrand]: true };

/** Normalized government-issued identity value. */
export type NationalId = string & { readonly [nationalIdBrand]: true };

/** Employment lifecycle status. */
export enum EmployeeStatus {
  Active = "active",
  Suspended = "suspended",
  Terminated = "terminated",
}

/** Contractual relationship type. */
export enum EmploymentType {
  Indefinite = "indefinite",
  FixedTerm = "fixed_term",
  Contractor = "contractor",
}

/** Currencies currently supported by employee compensation. */
export enum Currency {
  VES = "VES",
  USD = "USD",
}

/** Supported employee-leave categories. */
export enum LeaveKind {
  Vacation = "vacation",
  Medical = "medical",
  Maternity = "maternity",
  Paternity = "paternity",
  Unpaid = "unpaid",
}

/** Employee-leave lifecycle status. */
export enum LeaveStatus {
  Scheduled = "scheduled",
  Active = "active",
  Completed = "completed",
  Cancelled = "cancelled",
}

/** Legal identity attached to an employee. */
export interface PersonIdentity {
  readonly nationalId: NationalId;
  readonly fullName: string;
}

/** Contractual employment data. */
export interface EmploymentRelationship {
  readonly position: string;
  readonly hiredOn: string | null;
  readonly type: EmploymentType;
  readonly terminatedOn: string | null;
}

/** Effective monthly compensation expressed in minor currency units. */
export interface Compensation {
  readonly monthlySalaryMinor: bigint;
  readonly currency: Currency;
  readonly effectiveFrom: string;
}

/** Complete state required to rehydrate an employee aggregate. */
export interface EmployeeState {
  readonly id: EmployeeId;
  readonly companyId: CompanyId;
  readonly legacyEmployeeId: string | null;
  readonly person: PersonIdentity;
  readonly employment: EmploymentRelationship;
  readonly compensation: Compensation;
  readonly status: EmployeeStatus;
  readonly version: number;
}

/** Company-owned employee aggregate with controlled lifecycle transitions. */
export class Employee {
  readonly id: EmployeeId;
  readonly companyId: CompanyId;
  readonly legacyEmployeeId: string | null;
  readonly person: PersonIdentity;
  readonly employment: EmploymentRelationship;
  readonly compensation: Compensation;
  readonly status: EmployeeStatus;
  readonly version: number;

  /**
   * Rehydrates and validates an employee aggregate.
   *
   * @param state - Complete persisted or newly-created state.
   * @throws {EmployeeFailure} When the name, version or compensation is invalid.
   */
  constructor(state: EmployeeState) {
    if (
      !state.person.fullName.trim()
      || !Number.isSafeInteger(state.version)
      || state.version < 1
      || state.compensation.monthlySalaryMinor < 0n
    ) {
      throw new EmployeeFailure("EMPLOYEE_INVALID", "The employee state is invalid.");
    }
    this.id = state.id;
    this.companyId = state.companyId;
    this.legacyEmployeeId = state.legacyEmployeeId;
    this.person = Object.freeze({ ...state.person, fullName: state.person.fullName.trim() });
    this.employment = Object.freeze({ ...state.employment, position: state.employment.position.trim() });
    this.compensation = Object.freeze({ ...state.compensation });
    this.status = state.status;
    this.version = state.version;
  }

  /**
   * Enforces aggregate ownership by a company.
   *
   * @param companyId - Expected owning company.
   * @returns Nothing when ownership matches.
   * @throws {EmployeeFailure} When the aggregate belongs to another company.
   */
  assertBelongsTo(companyId: CompanyId): void {
    if (this.companyId !== companyId) {
      throw new EmployeeFailure("EMPLOYEE_OUTSIDE_COMPANY", "The employee belongs to another company.");
    }
  }

  /**
   * Suspends active employment.
   *
   * @returns A new aggregate version in suspended state.
   * @throws {EmployeeFailure} Unless the employee is active.
   */
  suspend(): Employee {
    if (this.status !== EmployeeStatus.Active) {
      throw new EmployeeFailure("EMPLOYEE_TRANSITION_INVALID", "Only active employment can be suspended.");
    }
    return new Employee({ ...this, status: EmployeeStatus.Suspended, version: this.version + 1 });
  }

  /**
   * Terminates employment on a local calendar date.
   *
   * @param terminatedOn - Termination date in `YYYY-MM-DD` format.
   * @returns A new terminated aggregate version.
   * @throws {EmployeeFailure} When already terminated or the date is invalid.
   */
  terminate(terminatedOn: string): Employee {
    if (this.status === EmployeeStatus.Terminated) {
      throw new EmployeeFailure("EMPLOYEE_TRANSITION_INVALID", "Employment is already terminated.");
    }
    return new Employee({
      ...this,
      status: EmployeeStatus.Terminated,
      employment: { ...this.employment, terminatedOn: localDate(terminatedOn) },
      version: this.version + 1,
    });
  }

  /**
   * Rehires terminated employment.
   *
   * @param hiredOn - New hire date in `YYYY-MM-DD` format.
   * @returns A new active aggregate version.
   * @throws {EmployeeFailure} Unless terminated or when the date is invalid.
   */
  rehire(hiredOn: string): Employee {
    if (this.status !== EmployeeStatus.Terminated) {
      throw new EmployeeFailure("EMPLOYEE_TRANSITION_INVALID", "Only terminated employment can be rehired.");
    }
    return new Employee({
      ...this,
      status: EmployeeStatus.Active,
      employment: { ...this.employment, hiredOn: localDate(hiredOn), terminatedOn: null },
      version: this.version + 1,
    });
  }

  /**
   * Changes the effective monthly compensation.
   *
   * @param compensation - New compensation and effective date.
   * @returns A new aggregate version with the compensation applied.
   * @throws {EmployeeFailure} When compensation or its date is invalid.
   */
  changeCompensation(compensation: Compensation): Employee {
    return new Employee({
      ...this,
      compensation: validateCompensation(compensation),
      version: this.version + 1,
    });
  }
}

/** Scheduled or historical leave associated with an employee. */
export interface EmployeeLeave {
  readonly id: string;
  readonly employeeId: EmployeeId;
  readonly kind: LeaveKind;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly status: LeaveStatus;
  readonly notes: string | null;
}

/** Stable expected-failure codes exposed by the employees capability. */
export type EmployeeFailureCode =
  | "EMPLOYEE_INVALID"
  | "EMPLOYEE_NOT_FOUND"
  | "EMPLOYEE_OUTSIDE_COMPANY"
  | "EMPLOYEE_TRANSITION_INVALID"
  | "EMPLOYEE_DUPLICATE_NATIONAL_ID"
  | "EMPLOYEE_REPOSITORY_UNAVAILABLE";

/** Expected failure raised by employee domain and boundary operations. */
export class EmployeeFailure extends Error {
  /**
   * @param code - Stable machine-readable failure code.
   * @param message - Safe diagnostic message.
   * @param options - Optional underlying cause.
   */
  constructor(readonly code: EmployeeFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmployeeFailure";
  }
}

/**
 * Validates and brands an employee identifier.
 *
 * @param value - Untrusted identifier.
 * @returns The normalized employee identifier.
 * @throws {EmployeeFailure} When empty.
 */
export function employeeId(value: string): EmployeeId {
  const normalized = value.trim();
  if (!normalized) {
    throw new EmployeeFailure("EMPLOYEE_INVALID", "Employee identifiers cannot be empty.");
  }
  return normalized as EmployeeId;
}

/**
 * Normalizes and brands a national identifier.
 *
 * @param value - Untrusted national identifier.
 * @returns The uppercase identifier without whitespace.
 * @throws {EmployeeFailure} When empty or longer than 32 characters.
 */
export function nationalId(value: string): NationalId {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized || normalized.length > 32) {
    throw new EmployeeFailure("EMPLOYEE_INVALID", "The national identifier is invalid.");
  }
  return normalized as NationalId;
}

/**
 * Validates a local calendar date without applying a timezone conversion.
 *
 * @param value - Date in `YYYY-MM-DD` format.
 * @returns The unchanged valid date.
 * @throws {EmployeeFailure} When the value is not a real calendar date.
 */
export function localDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new EmployeeFailure("EMPLOYEE_INVALID", "The date is invalid.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (date.toISOString().slice(0, 10) !== value) {
    throw new EmployeeFailure("EMPLOYEE_INVALID", "The date is invalid.");
  }
  return value;
}

function validateCompensation(value: Compensation): Compensation {
  if (value.monthlySalaryMinor < 0n) {
    throw new EmployeeFailure("EMPLOYEE_INVALID", "Salary cannot be negative.");
  }
  return Object.freeze({ ...value, effectiveFrom: localDate(value.effectiveFrom) });
}
