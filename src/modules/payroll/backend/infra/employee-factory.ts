import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { RpcEmployeeRepository } from './repository/rpc-employee.repository';
import { GetEmployeesByCompanyUseCase } from '../app/get-employees-by-company.case';
import { UpsertEmployeesUseCase }       from '../app/upsert-employees.case';
import { DeleteEmployeesUseCase }       from '../app/delete-employees.case';

export function getEmployeeActions(userId: string) {
    const source     = new ServerSupabaseSource();
    const repository = new RpcEmployeeRepository(source, userId);

    return {
        getByCompany:    new GetEmployeesByCompanyUseCase(repository),
        upsertEmployees: new UpsertEmployeesUseCase(repository),
        deleteEmployees: new DeleteEmployeesUseCase(repository),
        repository,   // exposed for direct repo calls (e.g. getSalaryHistory)
    };
}
