// company-factory — assembles the companies module dependency graph.
// Role: infrastructure entry point — wires RpcCompanyRepository into all use cases.
// Invariant: always use RpcCompanyRepository; the legacy SupabaseCompanyRepository was removed in Phase 3.
import { ServerSupabaseSource }    from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }           from '@/src/shared/backend/infra/local-event-bus';
import { RpcCompanyRepository }    from './repository/rpc-company.repository';
import { SaveCompanyUseCase }      from '../app/save-company.case';
import { UpdateCompanyUseCase }    from '../app/update-company.case';
import { DeleteCompanyUseCase }    from '../app/delete-company.case';
import { GetCompanyByIdUseCase }   from '../app/get-company-by-id.case';
import { GetUserCompaniesUseCase } from '../app/get-users-companies.case';

export function getCompanyActions(userId: string) {
    const source     = new ServerSupabaseSource();
    const repository = new RpcCompanyRepository(source, userId);
    const eventBus   = new LocalEventBus();

    return {
        save:       new SaveCompanyUseCase(repository, eventBus),
        update:     new UpdateCompanyUseCase(repository, eventBus),
        delete:     new DeleteCompanyUseCase(repository, eventBus),
        getById:    new GetCompanyByIdUseCase(repository),
        getByOwner: new GetUserCompaniesUseCase(repository),
    };
}
