import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IPeriodReportRepository } from '../../domain/repository/period-report.repository';
import { PeriodReportRow, VatType } from '../../domain/period-report';

type SharedPeriodReportRow = {
  code: string | null;
  name: string | null;
  departamento_nombre: string | null;
  proveedor_nombre: string | null;
  iva_tipo: string | null;
  inventario_inicial: number | string | null;
  costo_promedio: number | string | null;
  entradas: number | string | null;
  salidas: number | string | null;
  existencia_actual: number | string | null;
  costo_entradas_bs: number | string | null;
  total_salidas_s_iva_bs: number | string | null;
  costo_salidas_bs: number | string | null;
  costo_autoconsumo: number | string | null;
  costo_actual_bs: number | string | null;
};

const n = (value: number | string | null | undefined): number =>
  value == null || value === '' ? 0 : Number(value);

export class SharedPeriodReportRepository implements IPeriodReportRepository {
  constructor(
    private readonly source: ISource<SupabaseClient>,
    private readonly tenantId: string,
  ) {}

  async getReport(companyId: string, period: string): Promise<Result<PeriodReportRow[]>> {
    try {
      const { data, error } = await this.source.instance.rpc(
        'shared_inventory_period_report_get',
        {
          p_tenant_id: this.tenantId,
          p_company_id: companyId,
          p_period: period,
        },
      );

      if (error) return Result.fail(error.message);

      return Result.success(
        ((data as SharedPeriodReportRow[] | null) ?? []).map((row) => this.mapToDomain(row)),
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared period report');
    }
  }

  private mapToDomain(row: SharedPeriodReportRow): PeriodReportRow {
    const vatType: VatType = row.iva_tipo === 'exento' ? 'exento' : 'general';
    const vatPercentage = vatType === 'exento' ? 0 : 16;
    const vatFactor = 1 + vatPercentage / 100;
    const currentCostBs = n(row.costo_actual_bs);
    const totalVatBs = currentCostBs * (vatPercentage / 100);
    const totalOutboundNoVatBs = n(row.total_salidas_s_iva_bs);
    const selfConsumptionCost = n(row.costo_autoconsumo);

    return {
      code: row.code ?? '',
      name: row.name ?? '',
      departmentName: row.departamento_nombre ?? '',
      supplierName: row.proveedor_nombre ?? '',
      vatType,
      openingInventory: n(row.inventario_inicial),
      averageCost: n(row.costo_promedio),
      inbound: n(row.entradas),
      outbound: n(row.salidas),
      currentStock: n(row.existencia_actual),
      inboundCostBs: n(row.costo_entradas_bs),
      totalOutboundNoVatBs,
      outboundCostBs: n(row.costo_salidas_bs),
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
