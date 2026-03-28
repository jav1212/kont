// rpc-inventory-ledger.repository.ts — Supabase RPC adapter for the annual inventory ledger.
// Role: infrastructure — implements IInventoryLedgerRepository via Postgres RPC.
// Invariant: maps raw RPC rows to domain InventoryLedgerRow; no business logic here.
import { SupabaseClient } from '@supabase/supabase-js';
import { IInventoryLedgerRepository } from '../../domain/repository/inventory-ledger.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { InventoryLedgerRow } from '../../domain/inventory-ledger';

// Infrastructure DTO — shape of the raw Postgres RPC row returned by tenant_inventario_libro_inventarios.
interface InventoryLedgerRpcRow {
  id:             string | null;
  codigo:         string | null;
  nombre:         string | null;
  tipo:           string | null;
  unidad_medida:  string | null;
  cant_inicial:   number | null;
  valor_inicial:  number | null;
  cant_entradas:  number | null;
  valor_entradas: number | null;
  cant_salidas:   number | null;
  valor_salidas:  number | null;
  cant_final:     number | null;
  valor_final:    number | null;
  valor_compras:  number | null;
}

export class RpcInventoryLedgerRepository implements IInventoryLedgerRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getInventoryLedger(companyId: string, year: number): Promise<Result<InventoryLedgerRow[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_libro_inventarios', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                    p_anio:       year,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as InventoryLedgerRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch inventory ledger');
        }
    }

    private mapToDomain(row: InventoryLedgerRpcRow): InventoryLedgerRow {
        return {
            id:               row.id            ?? '',
            code:             row.codigo        ?? '',
            name:             row.nombre        ?? '',
            type:             row.tipo          ?? '',
            measureUnit:      row.unidad_medida ?? '',
            openingQuantity:  Number(row.cant_inicial   ?? 0),
            openingValue:     Number(row.valor_inicial  ?? 0),
            inboundQuantity:  Number(row.cant_entradas  ?? 0),
            inboundValue:     Number(row.valor_entradas ?? 0),
            outboundQuantity: Number(row.cant_salidas   ?? 0),
            outboundValue:    Number(row.valor_salidas  ?? 0),
            closingQuantity:  Number(row.cant_final     ?? 0),
            closingValue:     Number(row.valor_final    ?? 0),
            purchasesValue:   Number(row.valor_compras  ?? 0),
        };
    }
}
