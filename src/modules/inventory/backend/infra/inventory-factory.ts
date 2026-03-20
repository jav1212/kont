import { ServerSupabaseSource }          from '@/src/shared/backend/source/infra/server-supabase';
import { RpcProductoRepository }         from './repository/rpc-producto.repository';
import { RpcMovimientoRepository }       from './repository/rpc-movimiento.repository';
import { RpcTransformacionRepository }   from './repository/rpc-transformacion.repository';
import { RpcProveedorRepository }        from './repository/rpc-proveedor.repository';
import { RpcFacturaCompraRepository }    from './repository/rpc-factura-compra.repository';
import { GetProductosUseCase }           from '../app/get-productos.use-case';
import { SaveProductoUseCase }           from '../app/save-producto.use-case';
import { DeleteProductoUseCase }         from '../app/delete-producto.use-case';
import { GetMovimientosUseCase }         from '../app/get-movimientos.use-case';
import { SaveMovimientoUseCase }         from '../app/save-movimiento.use-case';
import { GetKardexUseCase }              from '../app/get-kardex.use-case';
import { GetTransformacionesUseCase }    from '../app/get-transformaciones.use-case';
import { SaveTransformacionUseCase }     from '../app/save-transformacion.use-case';
import { GetProveedoresUseCase }         from '../app/get-proveedores.use-case';
import { SaveProveedorUseCase }          from '../app/save-proveedor.use-case';
import { DeleteProveedorUseCase }        from '../app/delete-proveedor.use-case';
import { GetFacturasCompraUseCase }      from '../app/get-facturas-compra.use-case';
import { GetFacturaCompraUseCase }       from '../app/get-factura-compra.use-case';
import { SaveFacturaCompraUseCase }      from '../app/save-factura-compra.use-case';
import { ConfirmarFacturaCompraUseCase } from '../app/confirmar-factura-compra.use-case';

export function getInventoryActions(userId: string) {
    const source             = new ServerSupabaseSource();
    const productoRepo       = new RpcProductoRepository(source, userId);
    const movimientoRepo     = new RpcMovimientoRepository(source, userId);
    const transformacionRepo = new RpcTransformacionRepository(source, userId);
    const proveedorRepo      = new RpcProveedorRepository(source, userId);
    const facturaRepo        = new RpcFacturaCompraRepository(source, userId);

    return {
        getProductos:           new GetProductosUseCase(productoRepo),
        saveProducto:           new SaveProductoUseCase(productoRepo),
        deleteProducto:         new DeleteProductoUseCase(productoRepo),
        getMovimientos:         new GetMovimientosUseCase(movimientoRepo),
        saveMovimiento:         new SaveMovimientoUseCase(movimientoRepo),
        getKardex:              new GetKardexUseCase(movimientoRepo),
        getTransformaciones:    new GetTransformacionesUseCase(transformacionRepo),
        saveTransformacion:     new SaveTransformacionUseCase(transformacionRepo),
        getProveedores:         new GetProveedoresUseCase(proveedorRepo),
        saveProveedor:          new SaveProveedorUseCase(proveedorRepo),
        deleteProveedor:        new DeleteProveedorUseCase(proveedorRepo),
        getFacturasCompra:      new GetFacturasCompraUseCase(facturaRepo),
        getFacturaCompra:       new GetFacturaCompraUseCase(facturaRepo),
        saveFacturaCompra:      new SaveFacturaCompraUseCase(facturaRepo),
        confirmarFacturaCompra: new ConfirmarFacturaCompraUseCase(facturaRepo),
    };
}
