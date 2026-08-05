import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IIslrReportRepository } from '../../domain/repository/islr-report.repository';
import { IslrProduct, IslrMovement } from '../../domain/islr-report';

type Product = { id: string | null; code: string | null; name: string | null };
type Movement = {
  id: string | null; product_id: string | null; date: string | null; reference: string | null;
  type: string | null; quantity: number | string | null; unit_cost: number | string | null;
  total_cost: number | string | null; balance_quantity: number | string | null;
};

const n = (value: number | string | null | undefined): number =>
  value == null || value === '' ? 0 : Number(value);
const inbound = new Set(['entrada', 'entrada_compra', 'entrada_produccion', 'devolucion_venta', 'ajuste_positivo']);

export class SharedIslrReportRepository implements IIslrReportRepository {
  constructor(
    private readonly source: ISource<SupabaseClient>,
    private readonly tenantId: string,
  ) {}

  async getReport(companyId: string, period: string): Promise<Result<IslrProduct[]>> {
    try {
      const { data: movementData, error: movementError } = await this.source.instance
          .from('shared_inventory_movements')
          .select('id,product_id,date,reference,type,quantity,unit_cost,total_cost,balance_quantity')
          .eq('tenant_id', this.tenantId)
          .eq('company_id', companyId)
          .order('date', { ascending: true })
          .order('id', { ascending: true });
      if (movementError) return Result.fail(movementError.message);

      const movements = (movementData as Movement[] ?? []).filter((movement) => (movement.date ?? '').slice(0, 7) === period);
      const allMovements = (movementData as Movement[] ?? []);
      const productIds = [...new Set(movements.map((movement) => movement.product_id).filter((id): id is string => Boolean(id)))];
      if (productIds.length === 0) return Result.success([]);
      const { data: productData, error: productError } = await this.source.instance
        .from('shared_inventory_products')
        .select('id,code,name')
        .eq('tenant_id', this.tenantId)
        .eq('company_id', companyId)
        .in('id', productIds);
      if (productError) return Result.fail(productError.message);
      const byProduct = new Map<string, Movement[]>();
      for (const movement of allMovements) {
        const list = byProduct.get(movement.product_id ?? '') ?? [];
        list.push(movement);
        byProduct.set(movement.product_id ?? '', list);
      }
      const activeProducts = new Set(movements.map((movement) => movement.product_id).filter((id): id is string => Boolean(id)));

      return Result.success((productData as Product[] ?? [])
        .filter((product) => activeProducts.has(product.id ?? ''))
        .map((product): IslrProduct => {
          const productMovements = byProduct.get(product.id ?? '') ?? [];
          const prior = productMovements.filter((movement) => (movement.date ?? '').slice(0, 7) < period).at(-1);
          return {
            productId: product.id ?? '', productCode: product.code ?? '', productName: product.name ?? '',
            openingQuantity: n(prior?.balance_quantity),
            openingCost: n(prior?.balance_quantity) * n(prior?.unit_cost),
            movements: movements.filter((movement) => movement.product_id === product.id).map((movement): IslrMovement => {
              const isInbound = inbound.has(movement.type ?? '');
              return {
                id: movement.id ?? '', date: movement.date ?? '', reference: movement.reference ?? '', type: movement.type ?? '',
                inboundQuantity: isInbound ? n(movement.quantity) : 0,
                outboundQuantity: isInbound ? 0 : n(movement.quantity),
                balanceQuantity: n(movement.balance_quantity),
                inboundCost: isInbound ? n(movement.total_cost) : 0,
                outboundCost: isInbound ? 0 : n(movement.total_cost),
                balanceCost: n(movement.balance_quantity) * n(movement.unit_cost),
              };
            }),
          };
        }));
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared ISLR report');
    }
  }
}
