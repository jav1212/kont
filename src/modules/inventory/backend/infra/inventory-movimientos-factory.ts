// inventory-movimientos-factory — wires movement, transformation, and kardex use cases.
// Role: sub-factory for the Movimientos domain slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
import { ServerSupabaseSource }           from '@/src/shared/backend/source/infra/server-supabase';
import { RpcMovimientoRepository }        from './repository/rpc-movimiento.repository';
import { RpcTransformacionRepository }    from './repository/rpc-transformacion.repository';
import { GetMovimientosUseCase }          from '../app/get-movimientos.use-case';
import { SaveMovimientoUseCase }          from '../app/save-movimiento.use-case';
import { DeleteMovimientoUseCase }        from '../app/delete-movimiento.use-case';
import { UpdateMovimientoMetaUseCase }    from '../app/update-movimiento-meta.use-case';
import { GetKardexUseCase }               from '../app/get-kardex.use-case';
import { GetTransformacionesUseCase }     from '../app/get-transformaciones.use-case';
import { SaveTransformacionUseCase }      from '../app/save-transformacion.use-case';

export function getInventoryMovimientosActions(userId: string) {
    const source             = new ServerSupabaseSource();
    const movimientoRepo     = new RpcMovimientoRepository(source, userId);
    const transformacionRepo = new RpcTransformacionRepository(source, userId);

    return {
        getMovimientos:       new GetMovimientosUseCase(movimientoRepo),
        saveMovimiento:       new SaveMovimientoUseCase(movimientoRepo),
        deleteMovimiento:     new DeleteMovimientoUseCase(movimientoRepo),
        updateMovimientoMeta: new UpdateMovimientoMetaUseCase(movimientoRepo),
        getKardex:            new GetKardexUseCase(movimientoRepo),
        getTransformaciones:  new GetTransformacionesUseCase(transformacionRepo),
        saveTransformacion:   new SaveTransformacionUseCase(transformacionRepo),
    };
}
