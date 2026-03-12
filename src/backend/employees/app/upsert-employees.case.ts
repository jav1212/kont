// src/backend/employee/app/upsert-employees.case.ts

import { UseCase } from "@/src/core/domain/use-case";
import { IEmployeeRepository } from "../domain/repository/employee.repository";
import { Employee } from "../domain/employee";
import { Result } from "@/src/core/domain/result";

export interface UpsertEmployeesInput {
    employees: Employee[];
}

export class UpsertEmployeesUseCase extends UseCase<UpsertEmployeesInput, void> {
    constructor(private readonly employeeRepository: IEmployeeRepository) {
        super();
    }

    async execute(input: UpsertEmployeesInput): Promise<Result<void>> {
        if (!input.employees.length) return Result.fail("La lista de empleados está vacía");

        const invalid = input.employees.find((e) => !e.cedula || !e.nombre || !e.companyId);
        if (invalid) return Result.fail("Todos los empleados deben tener cédula, nombre y companyId");

        return await this.employeeRepository.upsertByCedula(input.employees);
    }
}