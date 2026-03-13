import { SupabaseSource } from '@/src/shared/backend/source/infra/supabase';
import { SupabaseCompanyRepository } from './repository/supabase-company.repository';
import { SaveCompanyUseCase } from '../app/save-company.case';
import { UpdateCompanyUseCase } from '../app/update-company.case';
import { DeleteCompanyUseCase } from '../app/delete-company.case';
import { GetCompanyByIdUseCase } from '../app/get-company-by-id.case';
import { GetUserCompaniesUseCase } from '../app/get-users-companies.case';

export function getCompanyActions() {
    const source = new SupabaseSource();
    const repository = new SupabaseCompanyRepository(source);

    return {
        save:       new SaveCompanyUseCase(repository),
        update:     new UpdateCompanyUseCase(repository),
        delete:     new DeleteCompanyUseCase(repository),
        getById:    new GetCompanyByIdUseCase(repository),
        getByOwner: new GetUserCompaniesUseCase(repository),
    };
}
