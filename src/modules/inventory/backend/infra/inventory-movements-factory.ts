// inventory-movimientos-factory — wires movement use cases.
// Role: sub-factory for the Movements domain slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
import { ServerSupabaseSource }            from '@/src/shared/backend/source/infra/server-supabase';
import { RpcMovementRepository }           from './repository/rpc-movement.repository';
import { RpcMovementDraftRepository }      from './repository/rpc-movement-draft.repository';
import { RpcProductRepository }            from './repository/rpc-product.repository';
import { ListMovementsUseCase }            from '../app/list-movements.use-case';
import { SaveMovementUseCase }             from '../app/save-movement.use-case';
import { DeleteMovementUseCase }           from '../app/delete-movement.use-case';
import { UpdateMovementMetaUseCase }       from '../app/update-movement-meta.use-case';
import { GenerateRandomSalesUseCase }      from '../app/generate-random-sales.use-case';
import { SaveMovementDraftUseCase }        from '../app/save-movement-draft.use-case';
import { ConfirmMovementDraftUseCase }     from '../app/confirm-movement-draft.use-case';
import { ListLatestMovementDraftUseCase }  from '../app/list-latest-movement-draft.use-case';
import { GetMovementDraftUseCase }         from '../app/get-movement-draft.use-case';
import { DiscardMovementDraftUseCase }     from '../app/discard-movement-draft.use-case';

export function getInventoryMovementsActions(userId: string) {
    const source             = new ServerSupabaseSource();
    const movementRepo       = new RpcMovementRepository(source, userId);
    const movementDraftRepo  = new RpcMovementDraftRepository(source, userId);
    const productRepo        = new RpcProductRepository(source, userId);

    return {
        listMovements:       new ListMovementsUseCase(movementRepo),
        saveMovement:        new SaveMovementUseCase(movementRepo),
        deleteMovement:      new DeleteMovementUseCase(movementRepo),
        updateMovementMeta:  new UpdateMovementMetaUseCase(movementRepo),
        generateRandomSales: new GenerateRandomSalesUseCase(productRepo, movementRepo),

        saveMovementDraft:        new SaveMovementDraftUseCase(movementDraftRepo),
        confirmMovementDraft:     new ConfirmMovementDraftUseCase(movementDraftRepo),
        listLatestMovementDraft:  new ListLatestMovementDraftUseCase(movementDraftRepo),
        getMovementDraft:         new GetMovementDraftUseCase(movementDraftRepo),
        discardMovementDraft:     new DiscardMovementDraftUseCase(movementDraftRepo),
    };
}
