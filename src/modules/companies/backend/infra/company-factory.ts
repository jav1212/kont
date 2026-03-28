// company-factory — assembles the companies module dependency graph.
// Role: infrastructure entry point — wires RpcCompanyRepository (canonical) into all use cases.
// Invariant: always use RpcCompanyRepository; the legacy SupabaseCompanyRepository was removed in Phase 3.
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { RpcCompanyRepository } from './repository/rpc-company.repository';
import { SaveCompanyUseCase } from '../app/save-company.case';
import { UpdateCompanyUseCase } from '../app/update-company.case';
import { DeleteCompanyUseCase } from '../app/delete-company.case';
import { GetCompanyByIdUseCase } from '../app/get-company-by-id.case';
import { GetUserCompaniesUseCase } from '../app/get-users-companies.case';

export function getCompanyActions(userId: string) {
    const source = new ServerSupabaseSource();
    const repository = new RpcCompanyRepository(source, userId);

    return {
        save:       new SaveCompanyUseCase(repository),
        update:     new UpdateCompanyUseCase(repository),
        delete:     new DeleteCompanyUseCase(repository),
        getById:    new GetCompanyByIdUseCase(repository),
        getByOwner: new GetUserCompaniesUseCase(repository),
    };
}
