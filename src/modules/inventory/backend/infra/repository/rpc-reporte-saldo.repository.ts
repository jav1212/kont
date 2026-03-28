import { SupabaseClient } from '@supabase/supabase-js';
import { IReporteSaldoRepository } from '../../domain/repository/reporte-saldo.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { ReporteSaldoRow } from '../../domain/reporte-saldo';

export class RpcReporteSaldoRepository implements IReporteSaldoRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getReporte(empresaId: string, periodo: string): Promise<Result<ReporteSaldoRow[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_reporte_saldo', {
                    p_user_id:    this.userId,
                    p_empresa_id: empresaId,
                    p_periodo:    periodo,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as Record<string, unknown>[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener reporte SALDO');
        }
    }

    private mapToDomain(row: Record<string, unknown>): ReporteSaldoRow {
        return {
            departamentoNombre: (row.departamento_nombre as string | null) ?? '',
            unidadesInicial:    Number(row.unidades_inicial ?? 0),
            costoInicial:       Number(row.costo_inicial ?? 0),
            unidadesEntradas:   Number(row.unidades_entradas ?? 0),
            costoEntradas:      Number(row.costo_entradas ?? 0),
            unidadesSalidas:    Number(row.unidades_salidas ?? 0),
            costoSalidas:       Number(row.costo_salidas ?? 0),
            unidadesExistencia: Number(row.unidades_existencia ?? 0),
            costoExistencia:    Number(row.costo_existencia ?? 0),
        };
    }
}
