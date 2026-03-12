import { Result } from "@/src/core/domain/result";
import { Employee } from "../employee";

export interface IEmployeeRepository {
    findByCompany(companyId: string): Promise<Result<Employee[]>>;
    upsertByCedula(employees: Employee[]): Promise<Result<void>>;  // insert or update by cedula
}