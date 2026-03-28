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
            return Result.success((data as Record<string, unknown>[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener reporte ISLR');
        }
    }

    private mapToDomain(row: Record<string, unknown>): ReporteISLRProducto {
        const movimientos = Array.isArray(row.movimientos)
            ? (row.movimientos as Record<string, unknown>[])
            : [];
        return {
            productoId:       (row.producto_id as string | null) ?? '',
            productoCodigo:   (row.producto_codigo as string | null) ?? '',
            productoNombre:   (row.producto_nombre as string | null) ?? '',
            aperturaCantidad: Number(row.apertura_cantidad ?? 0),
            aperturaCosto:    Number(row.apertura_costo ?? 0),
            movimientos:      movimientos.map((m): ReporteISLRMovimiento => ({
                id:            (m.id as string | null) ?? '',
                fecha:         (m.fecha as string | null) ?? '',
                referencia:    (m.referencia as string | null) ?? '',
                tipo:          (m.tipo as string | null) ?? '',
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
