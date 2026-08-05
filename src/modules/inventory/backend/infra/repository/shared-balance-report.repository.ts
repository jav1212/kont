import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IBalanceReportRepository } from '../../domain/repository/balance-report.repository';
import { BalanceReportRow } from '../../domain/balance-report';

type ProductRow = {
    id: string;
    department_id: string | null;
    current_stock: number | string | null;
    average_cost: number | string | null;
    shared_inventory_departments?: { name: string } | { name: string }[] | null;
};

type MovementRow = {
    product_id: string;
    type: string;
    date: string;
    quantity: number | string | null;
    total_cost: number | string | null;
    balance_quantity: number | string | null;
    balance_value: number | string | null;
    sale_price_unit: number | string | null;
};

const n = (value: number | string | null | undefined) => Number(value ?? 0);
const INBOUND = new Set(['entrada', 'devolucion_salida', 'ajuste_positivo']);
const OUTBOUND = new Set(['salida', 'autoconsumo', 'devolucion_entrada', 'ajuste_negativo']);

/** Shared-schema equivalent of tenant_inventario_reporte_saldo. */
export class SharedBalanceReportRepository implements IBalanceReportRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly tenantId: string,
    ) {}

    async getReport(companyId: string, period: string): Promise<Result<BalanceReportRow[]>> {
        try {
            const start = `${period}-01`;
            const [{ data: products, error: productsError }, { data: movements, error: movementsError }] = await Promise.all([
                this.source.instance
                    .from('shared_inventory_products')
                    .select('id,department_id,current_stock,average_cost,shared_inventory_departments(name)')
                    .eq('tenant_id', this.tenantId)
                    .eq('company_id', companyId)
                    .eq('active', true),
                this.source.instance
                    .from('shared_inventory_movements')
                    .select('product_id,type,date,quantity,total_cost,balance_quantity,balance_value,sale_price_unit')
                    .eq('tenant_id', this.tenantId)
                    .eq('company_id', companyId)
                    .order('date', { ascending: true }),
            ]);
            if (productsError) return Result.fail(productsError.message);
            if (movementsError) return Result.fail(movementsError.message);

            const movementByProduct = new Map<string, MovementRow[]>();
            for (const row of (movements ?? []) as MovementRow[]) {
                const list = movementByProduct.get(row.product_id) ?? [];
                list.push(row);
                movementByProduct.set(row.product_id, list);
            }

            const grouped = new Map<string, BalanceReportRow>();
            for (const product of (products ?? []) as ProductRow[]) {
                const departmentRelation = product.shared_inventory_departments;
                const departmentName = Array.isArray(departmentRelation)
                    ? departmentRelation[0]?.name ?? ''
                    : departmentRelation?.name ?? '';
                const row = grouped.get(departmentName) ?? {
                    departmentName,
                    openingUnits: 0,
                    openingCost: 0,
                    inboundUnits: 0,
                    inboundCost: 0,
                    outboundUnits: 0,
                    outboundCost: 0,
                    salesValueWithoutVat: 0,
                    closingUnits: 0,
                    closingCost: 0,
                };
                const history = movementByProduct.get(product.id) ?? [];
                const before = history.filter((movement) => movement.date < start).at(-1);
                row.openingUnits += n(before?.balance_quantity);
                row.openingCost += n(before?.balance_value);

                for (const movement of history.filter((item) => item.date.startsWith(`${period}-`))) {
                    const quantity = n(movement.quantity);
                    const totalCost = n(movement.total_cost);
                    if (INBOUND.has(movement.type)) {
                        row.inboundUnits += quantity;
                        row.inboundCost += totalCost;
                    } else if (OUTBOUND.has(movement.type)) {
                        row.outboundUnits += quantity;
                        row.outboundCost += totalCost;
                        row.salesValueWithoutVat += n(movement.sale_price_unit) * quantity;
                    }
                }

                row.closingUnits += row.openingUnits + row.inboundUnits - row.outboundUnits;
                row.closingCost += row.openingCost + row.inboundCost - row.outboundCost;
                grouped.set(departmentName, row);
            }

            return Result.success([...grouped.values()].sort((a, b) => a.departmentName.localeCompare(b.departmentName)));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared balance report');
        }
    }
}
