// Infrastructure layer — assembles the bonificaciones run dependency graph.
import { ServerSupabaseSource }              from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }                     from '@/src/shared/backend/infra/local-event-bus';
import { RpcBonificacionesRunRepository }    from './repository/rpc-bonificaciones-run.repository';
import { ConfirmBonificacionesRunUseCase }   from '../application/commands/confirm-bonificaciones-run.use-case';
import { UnconfirmBonificacionesRunUseCase } from '../application/commands/unconfirm-bonificaciones-run.use-case';
import { SaveDraftBonificacionesRunUseCase } from '../application/commands/save-draft-bonificaciones-run.use-case';
import { GetBonificacionesRunsUseCase }      from '../application/queries/get-bonificaciones-runs.use-case';
import { GetBonificacionesReceiptsUseCase }  from '../application/queries/get-bonificaciones-receipts.use-case';

export function getBonificacionesRunActions(userId: string) {
    const source     = new ServerSupabaseSource();
    const repository = new RpcBonificacionesRunRepository(source, userId);
    const eventBus   = new LocalEventBus();

    return {
        confirm:     new ConfirmBonificacionesRunUseCase(repository, eventBus),
        unconfirm:   new UnconfirmBonificacionesRunUseCase(repository),
        saveDraft:   new SaveDraftBonificacionesRunUseCase(repository),
        getRuns:     new GetBonificacionesRunsUseCase(repository),
        getReceipts: new GetBonificacionesReceiptsUseCase(repository),
    };
}
