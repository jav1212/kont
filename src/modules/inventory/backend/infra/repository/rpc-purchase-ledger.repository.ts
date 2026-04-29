// rpc-purchase-ledger.repository.ts — Supabase RPC adapter for the purchase ledger report.
// Role: infrastructure — implements IPurchaseLedgerRepository via Postgres RPC.
// Invariant: maps raw RPC rows to domain PurchaseLedgerRow; no business logic here.
import { SupabaseClient } from '@supabase/supabase-js';
import { IPurchaseLedgerRepository } from '../../domain/repository/purchase-ledger.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { PurchaseLedgerRow } from '../../domain/purchase-ledger';

// Infrastructure DTO — shape of the raw Postgres RPC row returned by tenant_inventario_libro_compras.
interface PurchaseLedgerRpcRow {
  id:               string | null;
  fecha:            string | null;
  numero_factura:   string | null;
  numero_control:   string | null;
  proveedor_rif:    string | null;
  proveedor_nombre: string | null;
  base_exenta:      number | null;
  base_gravada_8:   number | null;
  iva_8:            number | null;
  base_gravada_16:  number | null;
  iva_16:           number | null;
  iva_retenido:     number | null;
  total:            number | null;
}

export class RpcPurchaseLedgerRepository implements IPurchaseLedgerRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getPurchaseLedger(companyId: string, period: string): Promise<Result<PurchaseLedgerRow[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_libro_compras', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                    p_periodo:    period,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as PurchaseLedgerRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch purchase ledger');
        }
    }

    private mapToDomain(row: PurchaseLedgerRpcRow): PurchaseLedgerRow {
        return {
            id:            row.id              ?? '',
            date:          row.fecha           ?? '',
            invoiceNumber: row.numero_factura  ?? '',
            controlNumber: row.numero_control  ?? '',
            supplierRif:   row.proveedor_rif   ?? '',
            supplierName:  row.proveedor_nombre ?? '',
            exemptBase:    row.base_exenta     ?? 0,
            taxableBase8:  row.base_gravada_8  ?? 0,
            iva8:          row.iva_8           ?? 0,
            taxableBase16: row.base_gravada_16 ?? 0,
            iva16:         row.iva_16          ?? 0,
            ivaRetenido:   row.iva_retenido    ?? 0,
            total:         row.total           ?? 0,
        };
    }
}
