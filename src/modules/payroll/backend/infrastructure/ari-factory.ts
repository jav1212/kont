// src/modules/payroll/backend/infrastructure/ari-factory.ts
//
// DI factory: arma el grafo de dependencias de las declaraciones ARI.
// Invariante: siempre usa ServerSupabaseSource en el lado servidor.

import { ServerSupabaseSource }             from '@/src/shared/backend/source/infra/server-supabase';
import { RpcAriDeclarationRepository }      from './repository/rpc-ari-declaration.repository';
import { SharedAriDeclarationRepository }    from './repository/shared-ari-declaration.repository';
import { isSharedSchemaEnabled }             from '@/src/shared/backend/config/shared-schema-pilot';
import { GetAriDeclarationsByCompanyUseCase } from '../application/queries/get-ari-declarations-by-company.use-case';
import { SaveAriDeclarationUseCase }        from '../application/commands/save-ari-declaration.use-case';
import { DeleteAriDeclarationUseCase }      from '../application/commands/delete-ari-declaration.use-case';

export function getAriActions(userId: string) {
    const source = new ServerSupabaseSource();
    const repo = isSharedSchemaEnabled(userId)
        ? new SharedAriDeclarationRepository(source, userId)
        : new RpcAriDeclarationRepository(source, userId);

    return {
        getByCompany: new GetAriDeclarationsByCompanyUseCase(repo),
        save:         new SaveAriDeclarationUseCase(repo),
        remove:       new DeleteAriDeclarationUseCase(repo),
    };
}
