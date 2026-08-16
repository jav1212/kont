import type { CompanyId } from "@kontave/companies-domain";
import type { OrganizationId } from "@kontave/organizations-domain";
import { EmployeeFailure, type Compensation, type Employee, type EmployeeId, type EmployeeLeave, type NationalId } from "@kontave/employees-domain";

export interface EmployeeRepository {
  list(companyId:CompanyId,organizationId?:OrganizationId):Promise<readonly Employee[]>;
  findById(companyId:CompanyId,id:EmployeeId):Promise<Employee|null>;
  findByNationalId(companyId:CompanyId,nationalId:NationalId):Promise<Employee|null>;
  save(employee:Employee):Promise<void>;
}
export interface CompensationHistoryRepository { replaceCurrent(employee:Employee,previous:Compensation|null,reason:string):Promise<void> }
export interface EmployeeLeaveRepository { list(employeeId:EmployeeId):Promise<readonly EmployeeLeave[]>;save(leave:EmployeeLeave):Promise<void> }
export class ListCompanyEmployees { constructor(private readonly repository:EmployeeRepository){}async execute(organizationId:OrganizationId,companyId:CompanyId){const rows=await this.repository.list(companyId,organizationId);for(const employee of rows)employee.assertBelongsTo(companyId);return rows;} }
export class GetCompanyEmployee { constructor(private readonly repository:EmployeeRepository){}async execute(companyId:CompanyId,id:EmployeeId){const employee=await this.repository.findById(companyId,id);if(!employee)throw new EmployeeFailure("EMPLOYEE_NOT_FOUND","The employee does not exist.");employee.assertBelongsTo(companyId);return employee;} }
export class HireEmployee { constructor(private readonly repository:EmployeeRepository,private readonly history:CompensationHistoryRepository){}async execute(employee:Employee,reason:string){if(await this.repository.findByNationalId(employee.companyId,employee.person.nationalId))throw new EmployeeFailure("EMPLOYEE_DUPLICATE_NATIONAL_ID","The company already has this national identifier.");await this.repository.save(employee);await this.history.replaceCurrent(employee,null,reason);return employee;} }
export class ChangeEmployeeCompensation { constructor(private readonly repository:EmployeeRepository,private readonly history:CompensationHistoryRepository){}async execute(companyId:CompanyId,id:EmployeeId,next:Compensation,reason:string){const current=await new GetCompanyEmployee(this.repository).execute(companyId,id);const changed=current.changeCompensation(next);await this.history.replaceCurrent(changed,current.compensation,reason);await this.repository.save(changed);return changed;} }
