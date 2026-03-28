// Application layer — retrieves all employees for a given company.
import { UseCase } from "@/src/core/domain/use-case";
import { IEmployeeRepository } from "../../domain/repository/employee.repository";
import { Employee } from "../../domain/employee";
import { Result } from "@/src/core/domain/result";

export interface GetEmployeesByCompanyInput {
    companyId: string;
}

export class GetEmployeesByCompanyUseCase extends UseCase<GetEmployeesByCompanyInput, Employee[]> {
    constructor(private readonly employeeRepository: IEmployeeRepository) {
        super();
    }

    async execute(input: GetEmployeesByCompanyInput): Promise<Result<Employee[]>> {
        if (!input.companyId) return Result.fail("companyId es requerido");
        return await this.employeeRepository.findByCompany(input.companyId);
    }
}
