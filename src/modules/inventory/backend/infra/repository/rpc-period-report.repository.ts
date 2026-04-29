// rpc-period-report.repository.ts — Supabase RPC adapter for the inventory period report.
// Role: infrastructure — implements IPeriodReportRepository via Postgres RPC.
// Invariant: maps raw RPC rows to domain PeriodReportRow; no business logic here.
import { SupabaseClient } from '@supabase/supabase-js';
import { IPeriodReportRepository } from '../../domain/repository/period-report.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { PeriodReportRow, VatType } from '../../domain/period-report';

// Infrastructure DTO — shape of the raw Postgres RPC row returned by tenant_inventario_reporte_periodo.
interface PeriodReportRpcRow {
  codigo:                  string | null;
  nombre:                  string | null;
  departamento_nombre:     string | null;
  proveedor_nombre:        string | null;
  iva_tipo:                string | null;
  inventario_inicial:      number | null;
  costo_promedio:          number | null;
  entradas:                number | null;
  salidas:                 number | null;
  existencia_actual:       number | null;
  costo_entradas_bs:       number | null;
  total_salidas_s_iva_bs:  number | null;
  costo_salidas_bs:        number | null;
  costo_autoconsumo:       number | null;
  costo_actual_bs:         number | null;
}

export class RpcPeriodReportRepository implements IPeriodReportRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getReport(companyId: string, period: string): Promise<Result<PeriodReportRow[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_reporte_periodo', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                    p_periodo:    period,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as PeriodReportRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch period report');
        }
    }

    private mapToDomain(row: PeriodReportRpcRow): PeriodReportRow {
        const vatType: VatType = row.iva_tipo === 'exento' ? 'exento' : 'general';
        const vatPercentage = vatType === 'exento' ? 0 : 16;
        const vatFactor = 1 + vatPercentage / 100;
        const currentCostBs = Number(row.costo_actual_bs ?? 0);
        const totalVatBs = currentCostBs * (vatPercentage / 100);
        const totalOutboundNoVatBs = Number(row.total_salidas_s_iva_bs ?? 0);
        const selfConsumptionCost = Number(row.costo_autoconsumo ?? 0);
        return {
            code:                  row.codigo               ?? '',
            name:                  row.nombre               ?? '',
            departmentName:        row.departamento_nombre  ?? '',
            supplierName:          row.proveedor_nombre     ?? '',
            vatType,
            openingInventory:      Number(row.inventario_inicial     ?? 0),
            averageCost:           Number(row.costo_promedio         ?? 0),
            inbound:               Number(row.entradas               ?? 0),
            outbound:              Number(row.salidas                ?? 0),
            currentStock:          Number(row.existencia_actual      ?? 0),
            inboundCostBs:         Number(row.costo_entradas_bs      ?? 0),
            totalOutboundNoVatBs,
            outboundCostBs:        Number(row.costo_salidas_bs       ?? 0),
            selfConsumptionCost,
            currentCostBs,
            vatPercentage,
            totalVatBs,
            totalWithVatBs: currentCostBs + totalVatBs,
            salesWithVatBs: totalOutboundNoVatBs * vatFactor,
            selfConsumptionWithVatBs: selfConsumptionCost * vatFactor,
        };
    }
}
