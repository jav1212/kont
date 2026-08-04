// Infrastructure layer — assembles the employee module dependency graph.
// Selects the shared-schema pilot or legacy RPC adapter.
// The legacy RPC path remains the default until the pilot flag is enabled.
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }        from '@/src/shared/backend/infra/local-event-bus';
import { RpcEmployeeRepository } from './repository/rpc-employee.repository';
import { SharedEmployeeRepository } from './repository/shared-employee.repository';
import { UpsertEmployeesUseCase }       from '../application/commands/upsert-employees.use-case';
import { DeleteEmployeesUseCase }       from '../application/commands/delete-employees.use-case';
import { RenameEmployeeCedulaUseCase }  from '../application/commands/rename-employee-cedula.use-case';
import { GetEmployeesByCompanyUseCase } from '../application/queries/get-employees-by-company.use-case';
import { isSharedSchemaPilotEnabled }    from '@/src/shared/backend/config/shared-schema-pilot';

export function getEmployeeActions(userId: string) {
    const source     = new ServerSupabaseSource();
    const repository = isSharedSchemaPilotEnabled(process.env.SHARED_SCHEMA_EMPLOYEES_ENABLED, userId)
        ? new SharedEmployeeRepository(source, userId)
        : new RpcEmployeeRepository(source, userId);
    const eventBus   = new LocalEventBus();

    return {
        getByCompany:         new GetEmployeesByCompanyUseCase(repository),
        upsertEmployees:      new UpsertEmployeesUseCase(repository, eventBus),
        deleteEmployees:      new DeleteEmployeesUseCase(repository),
        renameEmployeeCedula: new RenameEmployeeCedulaUseCase(repository),
        repository,   // exposed for direct repo calls (e.g. getSalaryHistory)
    };
}
