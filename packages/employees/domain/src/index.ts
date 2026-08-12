import type { CompanyId } from "@kontave/companies-domain";

declare const employeeIdBrand: unique symbol;
declare const nationalIdBrand: unique symbol;
export type EmployeeId = string & { readonly [employeeIdBrand]: true };
export type NationalId = string & { readonly [nationalIdBrand]: true };

export enum EmployeeStatus { Active = "active", Suspended = "suspended", Terminated = "terminated" }
export enum EmploymentType { Indefinite = "indefinite", FixedTerm = "fixed_term", Contractor = "contractor" }
export enum Currency { VES = "VES", USD = "USD" }
export enum LeaveKind { Vacation = "vacation", Medical = "medical", Maternity = "maternity", Paternity = "paternity", Unpaid = "unpaid" }
export enum LeaveStatus { Scheduled = "scheduled", Active = "active", Completed = "completed", Cancelled = "cancelled" }

export interface PersonIdentity { readonly nationalId: NationalId; readonly fullName: string }
export interface EmploymentRelationship { readonly position: string; readonly hiredOn: string | null; readonly type: EmploymentType; readonly terminatedOn: string | null }
export interface Compensation { readonly monthlySalaryMinor: bigint; readonly currency: Currency; readonly effectiveFrom: string }

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

export class Employee {
  readonly id: EmployeeId; readonly companyId: CompanyId; readonly legacyEmployeeId: string | null;
  readonly person: PersonIdentity; readonly employment: EmploymentRelationship; readonly compensation: Compensation;
  readonly status: EmployeeStatus; readonly version: number;
  constructor(state: EmployeeState) {
    if (!state.person.fullName.trim() || state.version < 1 || state.compensation.monthlySalaryMinor < BigInt(0)) throw new EmployeeFailure("EMPLOYEE_INVALID", "The employee state is invalid.");
    this.id=state.id;this.companyId=state.companyId;this.legacyEmployeeId=state.legacyEmployeeId;this.person={...state.person,fullName:state.person.fullName.trim()};this.employment={...state.employment,position:state.employment.position.trim()};this.compensation=state.compensation;this.status=state.status;this.version=state.version;
  }
  assertBelongsTo(companyId: CompanyId): void { if(this.companyId!==companyId)throw new EmployeeFailure("EMPLOYEE_OUTSIDE_COMPANY","The employee belongs to another company."); }
  suspend(): Employee { if(this.status!==EmployeeStatus.Active)throw new EmployeeFailure("EMPLOYEE_TRANSITION_INVALID","Only active employment can be suspended.");return new Employee({...this,status:EmployeeStatus.Suspended,version:this.version+1}); }
  terminate(terminatedOn:string): Employee { if(this.status===EmployeeStatus.Terminated)throw new EmployeeFailure("EMPLOYEE_TRANSITION_INVALID","Employment is already terminated.");return new Employee({...this,status:EmployeeStatus.Terminated,employment:{...this.employment,terminatedOn:localDate(terminatedOn)},version:this.version+1}); }
  rehire(hiredOn:string): Employee { if(this.status!==EmployeeStatus.Terminated)throw new EmployeeFailure("EMPLOYEE_TRANSITION_INVALID","Only terminated employment can be rehired.");return new Employee({...this,status:EmployeeStatus.Active,employment:{...this.employment,hiredOn:localDate(hiredOn),terminatedOn:null},version:this.version+1}); }
  changeCompensation(compensation:Compensation):Employee{return new Employee({...this,compensation:validateCompensation(compensation),version:this.version+1});}
}

export interface EmployeeLeave { readonly id:string;readonly employeeId:EmployeeId;readonly kind:LeaveKind;readonly startsOn:string;readonly endsOn:string;readonly status:LeaveStatus;readonly notes:string|null }
export type EmployeeFailureCode="EMPLOYEE_INVALID"|"EMPLOYEE_NOT_FOUND"|"EMPLOYEE_OUTSIDE_COMPANY"|"EMPLOYEE_TRANSITION_INVALID"|"EMPLOYEE_DUPLICATE_NATIONAL_ID"|"EMPLOYEE_REPOSITORY_UNAVAILABLE";
export class EmployeeFailure extends Error { constructor(readonly code:EmployeeFailureCode,message:string,options?:ErrorOptions){super(message,options);this.name="EmployeeFailure";} }
export function employeeId(value:string):EmployeeId{const normalized=value.trim();if(!normalized)throw new EmployeeFailure("EMPLOYEE_INVALID","Employee identifiers cannot be empty.");return normalized as EmployeeId;}
export function nationalId(value:string):NationalId{const normalized=value.trim().toUpperCase().replace(/\s+/g,"");if(!normalized||normalized.length>32)throw new EmployeeFailure("EMPLOYEE_INVALID","The national identifier is invalid.");return normalized as NationalId;}
export function localDate(value:string):string{if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00Z`)))throw new EmployeeFailure("EMPLOYEE_INVALID","The date is invalid.");return value;}
function validateCompensation(value:Compensation):Compensation{if(value.monthlySalaryMinor<BigInt(0))throw new EmployeeFailure("EMPLOYEE_INVALID","Salary cannot be negative.");return{...value,effectiveFrom:localDate(value.effectiveFrom)};}
