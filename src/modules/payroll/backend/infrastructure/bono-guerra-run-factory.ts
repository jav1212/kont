// Infrastructure layer — assembles the bono de guerra run dependency graph.
import { ServerSupabaseSource }            from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }                   from '@/src/shared/backend/infra/local-event-bus';
import { RpcBonoGuerraRunRepository }      from './repository/rpc-bono-guerra-run.repository';
import { ConfirmBonoGuerraRunUseCase }     from '../application/commands/confirm-bono-guerra-run.use-case';
import { UnconfirmBonoGuerraRunUseCase }   from '../application/commands/unconfirm-bono-guerra-run.use-case';
import { SaveDraftBonoGuerraRunUseCase }   from '../application/commands/save-draft-bono-guerra-run.use-case';
import { GetBonoGuerraRunsUseCase }        from '../application/queries/get-bono-guerra-runs.use-case';
import { GetBonoGuerraReceiptsUseCase }    from '../application/queries/get-bono-guerra-receipts.use-case';

export function getBonoGuerraRunActions(userId: string) {
    const source     = new ServerSupabaseSource();
    const repository = new RpcBonoGuerraRunRepository(source, userId);
    const eventBus   = new LocalEventBus();

    return {
        confirm:     new ConfirmBonoGuerraRunUseCase(repository, eventBus),
        unconfirm:   new UnconfirmBonoGuerraRunUseCase(repository),
        saveDraft:   new SaveDraftBonoGuerraRunUseCase(repository),
        getRuns:     new GetBonoGuerraRunsUseCase(repository),
        getReceipts: new GetBonoGuerraReceiptsUseCase(repository),
    };
}
