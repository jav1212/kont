import { SupabaseClient } from '@supabase/supabase-js';
import { IReporteISLRRepository } from '../../domain/repository/reporte-islr.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { ReporteISLRProducto, ReporteISLRMovimiento } from '../../domain/reporte-islr';

export class RpcReporteISLRRepository implements IReporteISLRRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getReporte(empresaId: string, periodo: string): Promise<Result<ReporteISLRProducto[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_kardex_periodo', {
                    p_user_id:    this.userId,
                    p_empresa_id: empresaId,
                    p_periodo:    periodo,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as any[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener reporte ISLR');
        }
    }

    private mapToDomain(row: any): ReporteISLRProducto {
        return {
            productoId:       row.producto_id ?? '',
            productoCodigo:   row.producto_codigo ?? '',
            productoNombre:   row.producto_nombre ?? '',
            aperturaCantidad: Number(row.apertura_cantidad ?? 0),
            aperturaCosto:    Number(row.apertura_costo ?? 0),
            movimientos:      (row.movimientos as any[] ?? []).map((m: any): ReporteISLRMovimiento => ({
                id:            m.id ?? '',
                fecha:         m.fecha ?? '',
                referencia:    m.referencia ?? '',
                tipo:          m.tipo ?? '',
                cantEntrada:   Number(m.cant_entrada ?? 0),
                cantSalida:    Number(m.cant_salida ?? 0),
                saldoCantidad: Number(m.saldo_cantidad ?? 0),
                costoEntrada:  Number(m.costo_entrada ?? 0),
                costoSalida:   Number(m.costo_salida ?? 0),
                saldoCosto:    Number(m.saldo_costo ?? 0),
            })),
        };
    }
}
