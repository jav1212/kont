import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IInventoryLedgerRepository } from '../../domain/repository/inventory-ledger.repository';
import { InventoryLedgerRow } from '../../domain/inventory-ledger';

type Product = { id: string | null; code: string | null; name: string | null; type: string | null; measure_unit: string | null };
type Movement = { product_id: string | null; date: string | null; type: string | null; quantity: number | string | null; total_cost: number | string | null; balance_quantity: number | string | null; balance_value: number | string | null; unit_cost: number | string | null };
const n = (value: number | string | null | undefined): number => value == null || value === '' ? 0 : Number(value);
const inbound = new Set(['entrada', 'entrada_compra', 'entrada_produccion', 'devolucion_venta', 'ajuste_positivo']);
const outbound = new Set(['salida', 'salida_venta', 'salida_produccion', 'devolucion_compra', 'autoconsumo', 'ajuste_negativo', 'devolucion_entrada']);

export class SharedInventoryLedgerRepository implements IInventoryLedgerRepository {
  constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

  async getInventoryLedger(companyId: string, year: number): Promise<Result<InventoryLedgerRow[]>> {
    try {
      const start = `${year}-01-01`, end = `${year}-12-31`;
      const [{ data: productData, error: productError }, { data: movementData, error: movementError }] = await Promise.all([
        this.source.instance.from('shared_inventory_products').select('id,code,name,type,measure_unit').eq('tenant_id', this.tenantId).eq('company_id', companyId),
        this.source.instance.from('shared_inventory_movements').select('product_id,date,type,quantity,total_cost,balance_quantity,balance_value,unit_cost')
          .eq('tenant_id', this.tenantId).eq('company_id', companyId).order('date', { ascending: true }),
      ]);
      if (productError) return Result.fail(productError.message);
      if (movementError) return Result.fail(movementError.message);
      const movements = (movementData as Movement[] ?? []);
      const byProduct = new Map<string, Movement[]>();
      for (const movement of movements) {
        const list = byProduct.get(movement.product_id ?? '') ?? [];
        list.push(movement); byProduct.set(movement.product_id ?? '', list);
      }
      return Result.success((productData as Product[] ?? []).map((product): InventoryLedgerRow => {
        const history = byProduct.get(product.id ?? '') ?? [];
        const yearMovements = history.filter((movement) => (movement.date ?? '') >= start && (movement.date ?? '') <= end);
        const prior = history.filter((movement) => (movement.date ?? '') < start).at(-1);
        const openingQuantity = n(prior?.balance_quantity), openingValue = n(prior?.balance_value);
        const inboundMovements = yearMovements.filter((movement) => inbound.has(movement.type ?? ''));
        const outboundMovements = yearMovements.filter((movement) => outbound.has(movement.type ?? ''));
        const inboundQuantity = inboundMovements.reduce((sum, movement) => sum + n(movement.quantity), 0);
        const outboundQuantity = outboundMovements.reduce((sum, movement) => sum + n(movement.quantity), 0);
        const inboundValue = inboundMovements.reduce((sum, movement) => sum + n(movement.total_cost), 0);
        const outboundValue = outboundMovements.reduce((sum, movement) => sum + n(movement.total_cost), 0);
        const closing = yearMovements.at(-1) ?? prior;
        return {
          id: product.id ?? '', code: product.code ?? '', name: product.name ?? '', type: product.type ?? '', measureUnit: product.measure_unit ?? '',
          openingQuantity, openingValue, inboundQuantity, inboundValue, outboundQuantity, outboundValue,
          closingQuantity: n(closing?.balance_quantity) || openingQuantity + inboundQuantity - outboundQuantity,
          closingValue: n(closing?.balance_value) || openingValue + inboundValue - outboundValue,
          purchasesValue: inboundMovements.filter((movement) => (movement.type ?? '') === 'entrada_compra').reduce((sum, movement) => sum + n(movement.total_cost), 0),
        };
      }).filter((row) => row.inboundQuantity !== 0 || row.outboundQuantity !== 0 || row.openingQuantity !== 0 || row.closingQuantity !== 0));
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared inventory ledger');
    }
  }
}
