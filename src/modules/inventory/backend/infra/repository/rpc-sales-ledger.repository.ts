// rpc-sales-ledger.repository.ts — Supabase RPC adapter for the sales ledger report.
// Role: infrastructure — implements ISalesLedgerRepository via Postgres RPC.
// Invariant: maps raw RPC rows to domain SalesLedgerRow; no business logic here.
import { SupabaseClient } from '@supabase/supabase-js';
import { ISalesLedgerRepository } from '../../domain/repository/sales-ledger.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { SalesLedgerRow } from '../../domain/sales-ledger';

// Infrastructure DTO — shape of the raw Postgres RPC row returned by tenant_inventario_libro_ventas.
interface SalesLedgerRpcRow {
  id:               string | null;
  fecha:            string | null;
  numero_factura:   string | null;
  cliente_rif:      string | null;
  cliente_nombre:   string | null;
  base_exenta:      number | null;
  base_gravada_8:   number | null;
  iva_8:            number | null;
  base_gravada_16:  number | null;
  iva_16:           number | null;
  autoconsumo:      number | null;
  iva_autoconsumo:  number | null;
  total:            number | null;
  tipo:             string | null;
}

export class RpcSalesLedgerRepository implements ISalesLedgerRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getSalesLedger(companyId: string, period: string): Promise<Result<SalesLedgerRow[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_libro_ventas', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                    p_periodo:    period,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as SalesLedgerRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch sales ledger');
        }
    }

    private mapToDomain(row: SalesLedgerRpcRow): SalesLedgerRow {
        return {
            id:                 row.id              ?? '',
            date:               row.fecha           ?? '',
            invoiceNumber:      row.numero_factura  ?? '',
            clientRif:          row.cliente_rif     ?? '',
            clientName:         row.cliente_nombre  ?? '',
            exemptBase:         Number(row.base_exenta    ?? 0),
            taxableBase8:       Number(row.base_gravada_8  ?? 0),
            iva8:               Number(row.iva_8           ?? 0),
            taxableBase16:      Number(row.base_gravada_16 ?? 0),
            iva16:              Number(row.iva_16          ?? 0),
            selfConsumption:    Number(row.autoconsumo     ?? 0),
            selfConsumptionVat: Number(row.iva_autoconsumo ?? 0),
            total:              Number(row.total           ?? 0),
            tipo:               row.tipo === 'autoconsumo' ? 'autoconsumo' : 'venta',
        };
    }
}
