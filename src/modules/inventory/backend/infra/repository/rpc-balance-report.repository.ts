// rpc-balance-report.repository.ts — Supabase RPC adapter for the inventory balance report.
// Role: infrastructure — implements IBalanceReportRepository via Postgres RPC.
// Invariant: maps raw RPC rows to domain BalanceReportRow; no business logic here.
import { SupabaseClient } from '@supabase/supabase-js';
import { IBalanceReportRepository } from '../../domain/repository/balance-report.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { BalanceReportRow } from '../../domain/balance-report';

// Infrastructure DTO — shape of the raw Postgres RPC row returned by tenant_inventario_reporte_saldo.
interface BalanceReportRpcRow {
  departamento_nombre:  string | null;
  unidades_inicial:     number | null;
  costo_inicial:        number | null;
  unidades_entradas:    number | null;
  costo_entradas:       number | null;
  unidades_salidas:     number | null;
  costo_salidas:        number | null;
  unidades_existencia:  number | null;
  costo_existencia:     number | null;
}

export class RpcBalanceReportRepository implements IBalanceReportRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getReport(companyId: string, period: string): Promise<Result<BalanceReportRow[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_reporte_saldo', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                    p_periodo:    period,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as BalanceReportRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch balance report');
        }
    }

    private mapToDomain(row: BalanceReportRpcRow): BalanceReportRow {
        return {
            departmentName: row.departamento_nombre  ?? '',
            openingUnits:   Number(row.unidades_inicial    ?? 0),
            openingCost:    Number(row.costo_inicial       ?? 0),
            inboundUnits:   Number(row.unidades_entradas   ?? 0),
            inboundCost:    Number(row.costo_entradas      ?? 0),
            outboundUnits:  Number(row.unidades_salidas    ?? 0),
            outboundCost:   Number(row.costo_salidas       ?? 0),
            closingUnits:   Number(row.unidades_existencia ?? 0),
            closingCost:    Number(row.costo_existencia    ?? 0),
        };
    }
}
