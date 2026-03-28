// inventory-movimientos-factory — wires movement, transformation, and kardex use cases.
// Role: sub-factory for the Movements domain slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
import { ServerSupabaseSource }         from '@/src/shared/backend/source/infra/server-supabase';
import { RpcMovementRepository }        from './repository/rpc-movement.repository';
import { RpcTransformationRepository }  from './repository/rpc-transformation.repository';
import { ListMovementsUseCase }         from '../app/list-movements.use-case';
import { SaveMovementUseCase }          from '../app/save-movement.use-case';
import { DeleteMovementUseCase }        from '../app/delete-movement.use-case';
import { UpdateMovementMetaUseCase }    from '../app/update-movement-meta.use-case';
import { GetKardexUseCase }             from '../app/get-kardex.use-case';
import { ListTransformationsUseCase }   from '../app/list-transformations.use-case';
import { SaveTransformationUseCase }    from '../app/save-transformation.use-case';

export function getInventoryMovementsActions(userId: string) {
    const source             = new ServerSupabaseSource();
    const movementRepo       = new RpcMovementRepository(source, userId);
    const transformationRepo = new RpcTransformationRepository(source, userId);

    return {
        listMovements:       new ListMovementsUseCase(movementRepo),
        saveMovement:        new SaveMovementUseCase(movementRepo),
        deleteMovement:      new DeleteMovementUseCase(movementRepo),
        updateMovementMeta:  new UpdateMovementMetaUseCase(movementRepo),
        getKardex:           new GetKardexUseCase(movementRepo),
        listTransformations: new ListTransformationsUseCase(transformationRepo),
        saveTransformation:  new SaveTransformationUseCase(transformationRepo),
    };
}
