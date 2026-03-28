// inventory-productos-factory — wires product and department use cases.
// Role: sub-factory for the Productos domain slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
import { ServerSupabaseSource }       from '@/src/shared/backend/source/infra/server-supabase';
import { RpcProductoRepository }      from './repository/rpc-producto.repository';
import { RpcDepartamentoRepository }  from './repository/rpc-departamento.repository';
import { GetProductosUseCase }        from '../app/get-productos.use-case';
import { SaveProductoUseCase }        from '../app/save-producto.use-case';
import { DeleteProductoUseCase }      from '../app/delete-producto.use-case';
import { GetDepartamentosUseCase }    from '../app/get-departamentos.use-case';
import { SaveDepartamentoUseCase }    from '../app/save-departamento.use-case';
import { DeleteDepartamentoUseCase }  from '../app/delete-departamento.use-case';

export function getInventoryProductosActions(userId: string) {
    const source          = new ServerSupabaseSource();
    const productoRepo    = new RpcProductoRepository(source, userId);
    const departamentoRepo = new RpcDepartamentoRepository(source, userId);

    return {
        getProductos:      new GetProductosUseCase(productoRepo),
        saveProducto:      new SaveProductoUseCase(productoRepo),
        deleteProducto:    new DeleteProductoUseCase(productoRepo),
        getDepartamentos:  new GetDepartamentosUseCase(departamentoRepo),
        saveDepartamento:  new SaveDepartamentoUseCase(departamentoRepo),
        deleteDepartamento: new DeleteDepartamentoUseCase(departamentoRepo),
    };
}
