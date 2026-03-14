import { Result }               from "@/src/core/domain/result";
import { Employee, SalaryHistoryEntry } from "../employee";

export interface IEmployeeRepository {
    findByCompany(companyId: string): Promise<Result<Employee[]>>;
    upsertByCedula(employees: Employee[]): Promise<Result<void>>;
    deleteByIds(ids: string[]): Promise<Result<void>>;
    getSalaryHistory(companyId: string, cedula: string): Promise<Result<SalaryHistoryEntry[]>>;
}
