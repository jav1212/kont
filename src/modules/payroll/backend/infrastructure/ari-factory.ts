// src/modules/payroll/backend/infrastructure/ari-factory.ts
//
// DI factory: arma el grafo de dependencias de las declaraciones ARI.
// Invariante: siempre usa ServerSupabaseSource en el lado servidor.

import { ServerSupabaseSource }             from '@/src/shared/backend/source/infra/server-supabase';
import { SharedAriDeclarationRepository }    from './repository/shared-ari-declaration.repository';
import { GetAriDeclarationsByCompanyUseCase } from '../application/queries/get-ari-declarations-by-company.use-case';
import { SaveAriDeclarationUseCase }        from '../application/commands/save-ari-declaration.use-case';
import { DeleteAriDeclarationUseCase }      from '../application/commands/delete-ari-declaration.use-case';

export function getAriActions(userId: string) {
    const source = new ServerSupabaseSource();
    const repo = new SharedAriDeclarationRepository(source, userId);

    return {
        getByCompany: new GetAriDeclarationsByCompanyUseCase(repo),
        save:         new SaveAriDeclarationUseCase(repo),
        remove:       new DeleteAriDeclarationUseCase(repo),
    };
}
