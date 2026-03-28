// inventory-reportes-factory — wires all report and book use cases.
// Role: sub-factory for the Reportes domain slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
import { ServerSupabaseSource }            from '@/src/shared/backend/source/infra/server-supabase';
import { RpcReportePeriodoRepository }     from './repository/rpc-reporte-periodo.repository';
import { RpcLibroComprasRepository }       from './repository/rpc-libro-compras.repository';
import { RpcReporteISLRRepository }        from './repository/rpc-reporte-islr.repository';
import { RpcLibroVentasRepository }        from './repository/rpc-libro-ventas.repository';
import { RpcLibroInventariosRepository }   from './repository/rpc-libro-inventarios.repository';
import { RpcReporteSaldoRepository }       from './repository/rpc-reporte-saldo.repository';
import { GetReportePeriodoUseCase }        from '../app/get-reporte-periodo.use-case';
import { GetLibroComprasUseCase }          from '../app/get-libro-compras.use-case';
import { GetReporteISLRUseCase }           from '../app/get-reporte-islr.use-case';
import { GetLibroVentasUseCase }           from '../app/get-libro-ventas.use-case';
import { GetLibroInventariosUseCase }      from '../app/get-libro-inventarios.use-case';
import { GetReporteSaldoUseCase }          from '../app/get-reporte-saldo.use-case';

export function getInventoryReportesActions(userId: string) {
    const source               = new ServerSupabaseSource();
    const reporteRepo          = new RpcReportePeriodoRepository(source, userId);
    const libroComprasRepo     = new RpcLibroComprasRepository(source, userId);
    const reporteISLRRepo      = new RpcReporteISLRRepository(source, userId);
    const libroVentasRepo      = new RpcLibroVentasRepository(source, userId);
    const libroInventariosRepo = new RpcLibroInventariosRepository(source, userId);
    const reporteSaldoRepo     = new RpcReporteSaldoRepository(source, userId);

    return {
        getReportePeriodo:   new GetReportePeriodoUseCase(reporteRepo),
        getLibroCompras:     new GetLibroComprasUseCase(libroComprasRepo),
        getReporteISLR:      new GetReporteISLRUseCase(reporteISLRRepo),
        getLibroVentas:      new GetLibroVentasUseCase(libroVentasRepo),
        getLibroInventarios: new GetLibroInventariosUseCase(libroInventariosRepo),
        getReporteSaldo:     new GetReporteSaldoUseCase(reporteSaldoRepo),
    };
}
