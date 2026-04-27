// inventory-movimientos-factory — wires movement use cases.
// Role: sub-factory for the Movements domain slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
import { ServerSupabaseSource }         from '@/src/shared/backend/source/infra/server-supabase';
import { RpcMovementRepository }        from './repository/rpc-movement.repository';
import { RpcProductRepository }         from './repository/rpc-product.repository';
import { ListMovementsUseCase }         from '../app/list-movements.use-case';
import { SaveMovementUseCase }          from '../app/save-movement.use-case';
import { DeleteMovementUseCase }        from '../app/delete-movement.use-case';
import { UpdateMovementMetaUseCase }    from '../app/update-movement-meta.use-case';
import { GenerateRandomSalesUseCase }   from '../app/generate-random-sales.use-case';

export function getInventoryMovementsActions(userId: string) {
    const source             = new ServerSupabaseSource();
    const movementRepo       = new RpcMovementRepository(source, userId);
    const productRepo        = new RpcProductRepository(source, userId);

    return {
        listMovements:       new ListMovementsUseCase(movementRepo),
        saveMovement:        new SaveMovementUseCase(movementRepo),
        deleteMovement:      new DeleteMovementUseCase(movementRepo),
        updateMovementMeta:  new UpdateMovementMetaUseCase(movementRepo),
        generateRandomSales: new GenerateRandomSalesUseCase(productRepo, movementRepo),
    };
}
