import { SupabaseClient } from '@supabase/supabase-js';
import { IReportePeriodoRepository } from '../../domain/repository/reporte-periodo.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { ReportePeriodoRow, IvaTipo } from '../../domain/reporte-periodo';

export class RpcReportePeriodoRepository implements IReportePeriodoRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getReporte(empresaId: string, periodo: string): Promise<Result<ReportePeriodoRow[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_reporte_periodo', {
                    p_user_id:    this.userId,
                    p_empresa_id: empresaId,
                    p_periodo:    periodo,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as Record<string, unknown>[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener reporte');
        }
    }

    private mapToDomain(row: Record<string, unknown>): ReportePeriodoRow {
        const ivaTipo: IvaTipo = row.iva_tipo === 'exento' ? 'exento' : 'general';
        const ivaPorcentaje = ivaTipo === 'exento' ? 0 : 16;
        const costoActualBs = Number(row.costo_actual_bs ?? 0);
        const totalIvaBs = costoActualBs * (ivaPorcentaje / 100);
        return {
            codigo:              (row.codigo as string | null | undefined) ?? '',
            nombre:              (row.nombre as string | null | undefined) ?? '',
            departamentoNombre:  (row.departamento_nombre as string | null | undefined) ?? '',
            proveedorNombre:     (row.proveedor_nombre as string | null | undefined) ?? '',
            ivaTipo,
            inventarioInicial:   Number(row.inventario_inicial ?? 0),
            costoPromedio:       Number(row.costo_promedio ?? 0),
            entradas:            Number(row.entradas ?? 0),
            salidas:             Number(row.salidas ?? 0),
            existenciaActual:    Number(row.existencia_actual ?? 0),
            costoEntradasBs:     Number(row.costo_entradas_bs ?? 0),
            totalSalidasSIvaBs:  Number(row.total_salidas_s_iva_bs ?? 0),
            costoSalidasBs:      Number(row.costo_salidas_bs ?? 0),
            costoAutoconsumo:    Number(row.costo_autoconsumo ?? 0),
            costoActualBs,
            ivaPorcentaje,
            totalIvaBs,
            totalConIvaBs:       costoActualBs + totalIvaBs,
        };
    }
}
