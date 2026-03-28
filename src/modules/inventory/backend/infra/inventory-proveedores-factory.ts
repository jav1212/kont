// inventory-proveedores-factory — wires supplier and purchase invoice use cases.
// Role: sub-factory for the Proveedores + FacturasCompra domain slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
import { ServerSupabaseSource }           from '@/src/shared/backend/source/infra/server-supabase';
import { RpcProveedorRepository }         from './repository/rpc-proveedor.repository';
import { RpcFacturaCompraRepository }     from './repository/rpc-factura-compra.repository';
import { GetProveedoresUseCase }          from '../app/get-proveedores.use-case';
import { SaveProveedorUseCase }           from '../app/save-proveedor.use-case';
import { DeleteProveedorUseCase }         from '../app/delete-proveedor.use-case';
import { GetFacturasCompraUseCase }       from '../app/get-facturas-compra.use-case';
import { GetFacturaCompraUseCase }        from '../app/get-factura-compra.use-case';
import { SaveFacturaCompraUseCase }       from '../app/save-factura-compra.use-case';
import { ConfirmarFacturaCompraUseCase }  from '../app/confirmar-factura-compra.use-case';
import { DeleteFacturaCompraUseCase }     from '../app/delete-factura-compra.use-case';

export function getInventoryProveedoresActions(userId: string) {
    const source        = new ServerSupabaseSource();
    const proveedorRepo = new RpcProveedorRepository(source, userId);
    const facturaRepo   = new RpcFacturaCompraRepository(source, userId);

    return {
        getProveedores:         new GetProveedoresUseCase(proveedorRepo),
        saveProveedor:          new SaveProveedorUseCase(proveedorRepo),
        deleteProveedor:        new DeleteProveedorUseCase(proveedorRepo),
        getFacturasCompra:      new GetFacturasCompraUseCase(facturaRepo),
        getFacturaCompra:       new GetFacturaCompraUseCase(facturaRepo),
        saveFacturaCompra:      new SaveFacturaCompraUseCase(facturaRepo),
        confirmarFacturaCompra: new ConfirmarFacturaCompraUseCase(facturaRepo),
        deleteFacturaCompra:    new DeleteFacturaCompraUseCase(facturaRepo),
    };
}
