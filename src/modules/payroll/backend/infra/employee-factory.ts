// employee-factory — assembles the employee module dependency graph.
// Role: infrastructure entry point — wires RpcEmployeeRepository (canonical) into all use cases.
// Invariant: always use RpcEmployeeRepository; the legacy SupabaseEmployeeRepository was removed in Phase 3.
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }        from '@/src/shared/backend/infra/local-event-bus';
import { RpcEmployeeRepository } from './repository/rpc-employee.repository';
import { UpsertEmployeesUseCase }       from '../app/commands/upsert-employees.case';
import { DeleteEmployeesUseCase }       from '../app/commands/delete-employees.case';
import { GetEmployeesByCompanyUseCase } from '../app/queries/get-employees-by-company.case';

export function getEmployeeActions(userId: string) {
    const source     = new ServerSupabaseSource();
    const repository = new RpcEmployeeRepository(source, userId);
    const eventBus   = new LocalEventBus();

    return {
        getByCompany:    new GetEmployeesByCompanyUseCase(repository),
        upsertEmployees: new UpsertEmployeesUseCase(repository, eventBus),
        deleteEmployees: new DeleteEmployeesUseCase(repository),
        repository,   // exposed for direct repo calls (e.g. getSalaryHistory)
    };
}
