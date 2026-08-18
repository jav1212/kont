import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IBalanceReportRepository } from '../../domain/repository/balance-report.repository';
import { BalanceReportRow } from '../../domain/balance-report';

type ProductRow = {
    id: string;
    department_id: string | null;
    average_cost: number | string | null;
    shared_inventory_departments?: { name: string } | { name: string }[] | null;
};

type MovementRow = {
    id: string;
    product_id: string;
    type: string;
    date: string;
    period: string;
    quantity: number | string | null;
    total_cost: number | string | null;
    balance_quantity: number | string | null;
    balance_value: number | string | null;
    sale_price_unit: number | string | null;
    created_at: string;
};

const n = (value: number | string | null | undefined) => Number(value ?? 0);
const INBOUND = new Set(['entrada', 'devolucion_salida', 'ajuste_positivo']);
const OUTBOUND = new Set(['salida', 'autoconsumo', 'devolucion_entrada', 'ajuste_negativo']);
const SALES = new Set(['salida', 'autoconsumo']);
const PAGE_SIZE = 1_000;

function assertValidPeriod(period: string): void {
    const [year, month] = period.split('-').map(Number);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Invalid period. Expected format: YYYY-MM');
    }
}

/** Shared-schema equivalent of tenant_inventario_reporte_saldo. */
export class SharedBalanceReportRepository implements IBalanceReportRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly tenantId: string,
    ) {}

    async getReport(companyId: string, period: string): Promise<Result<BalanceReportRow[]>> {
        try {
            const start = `${period}-01`;
            assertValidPeriod(period);
            const products: ProductRow[] = [];
            const movements: MovementRow[] = [];

            // PostgREST caps unbounded reads at 1,000 rows. Full-market tenants
            // routinely exceed that limit, so an all-history read silently
            // omitted the requested period and produced zero entries/exits.
            for (let offset = 0; ; offset += PAGE_SIZE) {
                const { data, error } = await this.source.instance
                    .from('shared_inventory_products')
                    .select('id,department_id,average_cost,shared_inventory_departments(name)')
                    .eq('tenant_id', this.tenantId)
                    .eq('company_id', companyId)
                    .eq('active', true)
                    .order('id', { ascending: true })
                    .range(offset, offset + PAGE_SIZE - 1);
                if (error) return Result.fail(error.message);
                const page = (data as ProductRow[] | null) ?? [];
                products.push(...page);
                if (page.length < PAGE_SIZE) break;
            }

            for (let offset = 0; ; offset += PAGE_SIZE) {
                const { data, error } = await this.source.instance
                    .from('shared_inventory_movements')
                    .select('id,product_id,type,date,period,quantity,total_cost,balance_quantity,balance_value,sale_price_unit,created_at')
                    .eq('tenant_id', this.tenantId)
                    .eq('company_id', companyId)
                    .lt('date', start)
                    .order('date', { ascending: true })
                    .order('created_at', { ascending: true })
                    .order('id', { ascending: true })
                    .range(offset, offset + PAGE_SIZE - 1);
                if (error) return Result.fail(error.message);
                const page = (data as MovementRow[] | null) ?? [];
                movements.push(...page);
                if (page.length < PAGE_SIZE) break;
            }

            // Period movements are queried by their indexed YYYY-MM key. Keep
            // this separate from opening history so July never depends on how
            // many movements exist in prior months.
            for (let offset = 0; ; offset += PAGE_SIZE) {
                const { data, error } = await this.source.instance
                    .from('shared_inventory_movements')
                    .select('id,product_id,type,date,period,quantity,total_cost,balance_quantity,balance_value,sale_price_unit,created_at')
                    .eq('tenant_id', this.tenantId)
                    .eq('company_id', companyId)
                    .eq('period', period)
                    .order('date', { ascending: true })
                    .order('created_at', { ascending: true })
                    .order('id', { ascending: true })
                    .range(offset, offset + PAGE_SIZE - 1);
                if (error) return Result.fail(error.message);
                const page = (data as MovementRow[] | null) ?? [];
                movements.push(...page);
                if (page.length < PAGE_SIZE) break;
            }

            const movementByProduct = new Map<string, MovementRow[]>();
            for (const row of movements) {
                const list = movementByProduct.get(row.product_id) ?? [];
                list.push(row);
                movementByProduct.set(row.product_id, list);
            }

            const grouped = new Map<string, BalanceReportRow>();
            for (const product of products) {
                const departmentRelation = product.shared_inventory_departments;
                const departmentName = Array.isArray(departmentRelation)
                    ? departmentRelation[0]?.name ?? 'Sin departamento'
                    : departmentRelation?.name ?? 'Sin departamento';
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
                const openingUnits = n(before?.balance_quantity);
                const persistedOpeningCost = n(before?.balance_value);
                // Older shared movements did not persist balance_value. Match
                // the legacy report's valuation fallback instead of showing Bs 0.
                const openingCost = persistedOpeningCost !== 0
                    ? persistedOpeningCost
                    : openingUnits * n(product.average_cost);
                let inboundUnits = 0;
                let inboundCost = 0;
                let outboundUnits = 0;
                let outboundCost = 0;
                let salesValueWithoutVat = 0;

                for (const movement of history.filter((item) => item.period === period)) {
                    const quantity = n(movement.quantity);
                    const totalCost = n(movement.total_cost);
                    if (INBOUND.has(movement.type)) {
                        inboundUnits += quantity;
                        inboundCost += totalCost;
                    } else if (OUTBOUND.has(movement.type)) {
                        outboundUnits += quantity;
                        outboundCost += totalCost;
                        if (SALES.has(movement.type)) {
                            salesValueWithoutVat += n(movement.sale_price_unit) * quantity;
                        }
                    }
                }

                row.openingUnits += openingUnits;
                row.openingCost += openingCost;
                row.inboundUnits += inboundUnits;
                row.inboundCost += inboundCost;
                row.outboundUnits += outboundUnits;
                row.outboundCost += outboundCost;
                row.salesValueWithoutVat += salesValueWithoutVat;
                // Calculate the product balance before adding it to the
                // department. Using row.* here compounded prior products.
                row.closingUnits += openingUnits + inboundUnits - outboundUnits;
                row.closingCost += openingCost + inboundCost - outboundCost;
                grouped.set(departmentName, row);
            }

            return Result.success([...grouped.values()].sort((a, b) => a.departmentName.localeCompare(b.departmentName)));
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared balance report');
        }
    }
}
