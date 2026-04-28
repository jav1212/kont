// Infrastructure layer — assembles the cesta ticket run dependency graph.
import { ServerSupabaseSource }              from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }                     from '@/src/shared/backend/infra/local-event-bus';
import { RpcCestaTicketRunRepository }       from './repository/rpc-cesta-ticket-run.repository';
import { ConfirmCestaTicketRunUseCase }      from '../application/commands/confirm-cesta-ticket-run.use-case';
import { SaveDraftCestaTicketRunUseCase }    from '../application/commands/save-draft-cesta-ticket-run.use-case';
import { GetCestaTicketRunsUseCase }         from '../application/queries/get-cesta-ticket-runs.use-case';
import { GetCestaTicketReceiptsUseCase }     from '../application/queries/get-cesta-ticket-receipts.use-case';

export function getCestaTicketRunActions(userId: string) {
    const source     = new ServerSupabaseSource();
    const repository = new RpcCestaTicketRunRepository(source, userId);
    const eventBus   = new LocalEventBus();

    return {
        confirm:     new ConfirmCestaTicketRunUseCase(repository, eventBus),
        saveDraft:   new SaveDraftCestaTicketRunUseCase(repository),
        getRuns:     new GetCestaTicketRunsUseCase(repository),
        getReceipts: new GetCestaTicketReceiptsUseCase(repository),
    };
}
