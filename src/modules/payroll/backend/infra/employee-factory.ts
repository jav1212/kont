// src/backend/employee/infra/employee-factory.ts

import { SupabaseSource } from "@/src/shared/backend/source/infra/supabase";
import { SupabaseEmployeeRepository } from "./repository/supabase-employee.repository";
import { GetEmployeesByCompanyUseCase } from "../app/get-employees-by-company.case";
import { UpsertEmployeesUseCase } from "../app/upsert-employees.case";

export function getEmployeeActions() {
    const source     = new SupabaseSource();
    const repository = new SupabaseEmployeeRepository(source);

    return {
        getByCompany:    new GetEmployeesByCompanyUseCase(repository),
        upsertEmployees: new UpsertEmployeesUseCase(repository),
    };
}