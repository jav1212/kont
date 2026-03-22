import { ServerSupabaseSource }          from '@/src/shared/backend/source/infra/server-supabase';
import { RpcProductoRepository }         from './repository/rpc-producto.repository';
import { RpcMovimientoRepository }       from './repository/rpc-movimiento.repository';
import { RpcTransformacionRepository }   from './repository/rpc-transformacion.repository';
import { RpcProveedorRepository }        from './repository/rpc-proveedor.repository';
import { RpcFacturaCompraRepository }    from './repository/rpc-factura-compra.repository';
import { RpcDepartamentoRepository }     from './repository/rpc-departamento.repository';
import { RpcReportePeriodoRepository }   from './repository/rpc-reporte-periodo.repository';
import { RpcLibroComprasRepository }     from './repository/rpc-libro-compras.repository';
import { RpcReporteISLRRepository }     from './repository/rpc-reporte-islr.repository';
import { RpcLibroVentasRepository }     from './repository/rpc-libro-ventas.repository';
import { RpcLibroInventariosRepository } from './repository/rpc-libro-inventarios.repository';
import { RpcReporteSaldoRepository }    from './repository/rpc-reporte-saldo.repository';
import { GetProductosUseCase }           from '../app/get-productos.use-case';
import { SaveProductoUseCase }           from '../app/save-producto.use-case';
import { DeleteProductoUseCase }         from '../app/delete-producto.use-case';
import { GetMovimientosUseCase }         from '../app/get-movimientos.use-case';
import { SaveMovimientoUseCase }         from '../app/save-movimiento.use-case';
import { DeleteMovimientoUseCase }       from '../app/delete-movimiento.use-case';
import { UpdateMovimientoMetaUseCase }   from '../app/update-movimiento-meta.use-case';
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
import { DeleteFacturaCompraUseCase }   from '../app/delete-factura-compra.use-case';
import { GetDepartamentosUseCase }       from '../app/get-departamentos.use-case';
import { SaveDepartamentoUseCase }       from '../app/save-departamento.use-case';
import { DeleteDepartamentoUseCase }     from '../app/delete-departamento.use-case';
import { GetReportePeriodoUseCase }      from '../app/get-reporte-periodo.use-case';
import { GetLibroComprasUseCase }        from '../app/get-libro-compras.use-case';
import { GetReporteISLRUseCase }        from '../app/get-reporte-islr.use-case';
import { GetLibroVentasUseCase }        from '../app/get-libro-ventas.use-case';
import { GetLibroInventariosUseCase }   from '../app/get-libro-inventarios.use-case';
import { GetReporteSaldoUseCase }       from '../app/get-reporte-saldo.use-case';

export function getInventoryActions(userId: string) {
    const source             = new ServerSupabaseSource();
    const productoRepo       = new RpcProductoRepository(source, userId);
    const movimientoRepo     = new RpcMovimientoRepository(source, userId);
    const transformacionRepo = new RpcTransformacionRepository(source, userId);
    const proveedorRepo      = new RpcProveedorRepository(source, userId);
    const facturaRepo        = new RpcFacturaCompraRepository(source, userId);
    const departamentoRepo   = new RpcDepartamentoRepository(source, userId);
    const reporteRepo        = new RpcReportePeriodoRepository(source, userId);
    const libroComprasRepo   = new RpcLibroComprasRepository(source, userId);
    const reporteISLRRepo    = new RpcReporteISLRRepository(source, userId);
    const libroVentasRepo       = new RpcLibroVentasRepository(source, userId);
    const libroInventariosRepo  = new RpcLibroInventariosRepository(source, userId);
    const reporteSaldoRepo      = new RpcReporteSaldoRepository(source, userId);

    return {
        getProductos:           new GetProductosUseCase(productoRepo),
        saveProducto:           new SaveProductoUseCase(productoRepo),
        deleteProducto:         new DeleteProductoUseCase(productoRepo),
        getMovimientos:         new GetMovimientosUseCase(movimientoRepo),
        saveMovimiento:         new SaveMovimientoUseCase(movimientoRepo),
        deleteMovimiento:       new DeleteMovimientoUseCase(movimientoRepo),
        updateMovimientoMeta:   new UpdateMovimientoMetaUseCase(movimientoRepo),
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
        deleteFacturaCompra:    new DeleteFacturaCompraUseCase(facturaRepo),
        getDepartamentos:       new GetDepartamentosUseCase(departamentoRepo),
        saveDepartamento:       new SaveDepartamentoUseCase(departamentoRepo),
        deleteDepartamento:     new DeleteDepartamentoUseCase(departamentoRepo),
        getReportePeriodo:      new GetReportePeriodoUseCase(reporteRepo),
        getLibroCompras:        new GetLibroComprasUseCase(libroComprasRepo),
        getReporteISLR:         new GetReporteISLRUseCase(reporteISLRRepo),
        getLibroVentas:         new GetLibroVentasUseCase(libroVentasRepo),
        getLibroInventarios:    new GetLibroInventariosUseCase(libroInventariosRepo),
        getReporteSaldo:        new GetReporteSaldoUseCase(reporteSaldoRepo),
    };
}
