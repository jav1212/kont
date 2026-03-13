import { TenantSupabaseSource } from '@/src/shared/backend/source/infra/tenant-supabase';
import { SupabaseEmployeeRepository } from './repository/supabase-employee.repository';
import { GetEmployeesByCompanyUseCase } from '../app/get-employees-by-company.case';
import { UpsertEmployeesUseCase }       from '../app/upsert-employees.case';
import { DeleteEmployeesUseCase }       from '../app/delete-employees.case';

export function getEmployeeActions(schemaName: string) {
    const source     = new TenantSupabaseSource(schemaName);
    const repository = new SupabaseEmployeeRepository(source);

    return {
        getByCompany:    new GetEmployeesByCompanyUseCase(repository),
        upsertEmployees: new UpsertEmployeesUseCase(repository),
        deleteEmployees: new DeleteEmployeesUseCase(repository),
    };
}
