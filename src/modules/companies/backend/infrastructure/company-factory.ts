// Infrastructure layer — assembles the companies module dependency graph.
import { ServerSupabaseSource }          from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }                 from '@/src/shared/backend/infra/local-event-bus';
import { SharedCompanyRepository }       from './repository/shared-company.repository';
import { SharedDepartmentRepository }    from '@/src/modules/inventory/backend/infra/repository/shared-department.repository';
import { SaveCompanyUseCase }            from '../application/commands/save-company.use-case';
import { UpdateCompanyUseCase }          from '../application/commands/update-company.use-case';
import { DeleteCompanyUseCase }          from '../application/commands/delete-company.use-case';
import { ApplySectorTemplateUseCase }    from '../application/commands/apply-sector-template.use-case';
import { GetCompanyByIdUseCase }         from '../application/queries/get-company-by-id.use-case';
import { GetUserCompaniesUseCase }       from '../application/queries/get-users-companies.use-case';

export function getCompanyActions(userId: string) {
    const source          = new ServerSupabaseSource();
    const repository = new SharedCompanyRepository(source, userId);
    const departmentRepo = new SharedDepartmentRepository(source, userId);
    const eventBus        = new LocalEventBus();

    return {
        save:               new SaveCompanyUseCase(repository, eventBus),
        update:             new UpdateCompanyUseCase(repository, eventBus),
        delete:             new DeleteCompanyUseCase(repository, eventBus),
        getById:            new GetCompanyByIdUseCase(repository),
        getByOwner:         new GetUserCompaniesUseCase(repository),
        applySectorTemplate:new ApplySectorTemplateUseCase(repository, departmentRepo),
        repository,
    };
}
