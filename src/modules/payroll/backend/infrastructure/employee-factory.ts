// Infrastructure layer — assembles the employee module dependency graph.
// Wires RpcEmployeeRepository (canonical) into all use cases.
// Invariant: always use RpcEmployeeRepository; the legacy SupabaseEmployeeRepository was removed in Phase 3.
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }        from '@/src/shared/backend/infra/local-event-bus';
import { RpcEmployeeRepository } from './repository/rpc-employee.repository';
import { UpsertEmployeesUseCase }       from '../application/commands/upsert-employees.use-case';
import { DeleteEmployeesUseCase }       from '../application/commands/delete-employees.use-case';
import { RenameEmployeeCedulaUseCase }  from '../application/commands/rename-employee-cedula.use-case';
import { GetEmployeesByCompanyUseCase } from '../application/queries/get-employees-by-company.use-case';

export function getEmployeeActions(userId: string) {
    const source     = new ServerSupabaseSource();
    const repository = new RpcEmployeeRepository(source, userId);
    const eventBus   = new LocalEventBus();

    return {
        getByCompany:         new GetEmployeesByCompanyUseCase(repository),
        upsertEmployees:      new UpsertEmployeesUseCase(repository, eventBus),
        deleteEmployees:      new DeleteEmployeesUseCase(repository),
        renameEmployeeCedula: new RenameEmployeeCedulaUseCase(repository),
        repository,   // exposed for direct repo calls (e.g. getSalaryHistory)
    };
}
