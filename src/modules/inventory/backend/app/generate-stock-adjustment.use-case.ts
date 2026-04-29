// generate-stock-adjustment.use-case — propone un ajuste directo de existencia
// que NO crea movimientos en el kardex. Reparte equitativamente en Bs el delta
// entre productos elegibles hasta cuadrar la existencia actual con un target
// (porcentaje de Entradas Bs o Ventas S/IVA Bs del periodo, o monto Bs fijo).
//
// NO persiste — devuelve el preview que el usuario confirma o regenera desde
// la UI. La persistencia la realiza SaveStockAdjustmentUseCase, que actualiza
// product.currentStock vía productRepo.upsert sin tocar averageCost.
//
// Caps de seguridad:
//   - Productos con averageCost = 0 se excluyen (no se pueden valorar en Bs).
//   - newStock < 0 → cap a 0 (no permitir stock negativo). El residuo de Bs
//     no aplicado queda como `residualBs`.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IProductRepository } from '../domain/repository/product.repository';
import { IBalanceReportRepository } from '../domain/repository/balance-report.repository';
import { Product, ProductType } from '../domain/product';

export type AdjustmentBaseSource = 'entradas' | 'ventas';
export type AdjustmentMode = 'porcentaje' | 'monto';

export interface GenerateStockAdjustmentInput {
    companyId:        string;
    period:           string;            // YYYY-MM
    baseSource:       AdjustmentBaseSource;
    mode:             AdjustmentMode;
    target:           number;            // % si mode='porcentaje'; Bs si mode='monto'
    productTypes?:    ProductType[];     // default: todos los tipos
    departmentId?:    string;            // default: todos
    excludeZeroCost?: boolean;           // default: true
}

export interface StockAdjustmentLine {
    productId:       string;
    productCode:     string;
    productName:     string;
    departmentName:  string;
    currentStock:    number;
    averageCost:     number;
    currentValueBs:  number;
    deltaQty:        number;
    newStock:        number;
    newValueBs:      number;
    capped:          boolean;            // true si stock new se topó en 0
}

export interface StockAdjustmentPreview {
    period:             string;
    baseSource:         AdjustmentBaseSource;
    baseBs:             number;          // Entradas Bs ó Ventas S/IVA Bs del periodo
    targetBs:           number;          // monto absoluto a alcanzar
    currentStockBs:     number;          // Σ(currentStock × averageCost) sobre elegibles
    deltaTotalBs:       number;          // targetBs − currentStockBs (signo importa)
    appliedDeltaBs:     number;          // Σ(deltaQty × averageCost) sobre elegibles
    residualBs:         number;          // deltaTotalBs − appliedDeltaBs (no aplicado por caps o redondeo)
    cappedCount:        number;          // productos topados a 0
    lines:              StockAdjustmentLine[];
}

const ROUND2 = (n: number) => Math.round(n * 100) / 100;
const ROUND4 = (n: number) => Math.round(n * 10000) / 10000;

export class GenerateStockAdjustmentUseCase
    extends UseCase<GenerateStockAdjustmentInput, StockAdjustmentPreview> {

    constructor(
        private readonly productRepo:        IProductRepository,
        private readonly balanceReportRepo:  IBalanceReportRepository,
    ) { super(); }

    async execute(input: GenerateStockAdjustmentInput): Promise<Result<StockAdjustmentPreview>> {
        const { companyId, period, baseSource, mode, target } = input;

        if (!companyId)                                           return Result.fail('companyId es requerido');
        if (!/^\d{4}-\d{2}$/.test(period))                        return Result.fail('period debe tener formato YYYY-MM');
        if (baseSource !== 'entradas' && baseSource !== 'ventas') return Result.fail('baseSource debe ser "entradas" o "ventas"');
        if (mode !== 'porcentaje' && mode !== 'monto')            return Result.fail('mode debe ser "porcentaje" o "monto"');
        if (!Number.isFinite(target) || target < 0)               return Result.fail('target inválido (debe ser ≥ 0)');

        const excludeZeroCost = input.excludeZeroCost ?? true;
        const departmentId = (input.departmentId ?? '').trim() || undefined;
        const productTypes = (input.productTypes && input.productTypes.length > 0)
            ? new Set(input.productTypes)
            : null;

        // ── Productos elegibles
        const productsRes = await this.productRepo.findByCompany(companyId);
        if (productsRes.isFailure) return Result.fail(productsRes.getError());
        const eligible: Product[] = productsRes.getValue().filter((p) => {
            if (!p.active) return false;
            if (productTypes && !productTypes.has(p.type)) return false;
            if (departmentId && p.departmentId !== departmentId) return false;
            if (excludeZeroCost && (p.averageCost ?? 0) <= 0) return false;
            return true;
        });
        if (eligible.length === 0) {
            return Result.fail('No hay productos elegibles con los filtros aplicados');
        }

        // ── Base Bs y target absoluto. Lee del MISMO RPC que el balance-report
        // que el usuario consulta visualmente (tenant_inventario_reporte_saldo),
        // para que los KPIs "Entradas" y "Ventas (S/IVA)" mostrados en pantalla
        // coincidan exactamente con la base de cálculo del ajuste.
        const reportRes = await this.balanceReportRepo.getReport(companyId, period);
        if (reportRes.isFailure) return Result.fail(reportRes.getError());
        const rows = reportRes.getValue();
        const baseBs = baseSource === 'entradas'
            ? rows.reduce((s, r) => s + (r.inboundCost          ?? 0), 0)
            : rows.reduce((s, r) => s + (r.salesValueWithoutVat ?? 0), 0);

        const targetBs = mode === 'porcentaje'
            ? baseBs * (target / 100)
            : target;

        // ── Estado actual y delta total
        const currentStockBs = eligible.reduce(
            (s, p) => s + (p.currentStock ?? 0) * (p.averageCost ?? 0),
            0,
        );
        const deltaTotalBs = targetBs - currentStockBs;

        // ── Distribución equitativa en Bs por producto
        // perLineBs = ΔTotal / N (con signo). qty se redondea a entero.
        const N = eligible.length;
        const perLineBs = N > 0 ? deltaTotalBs / N : 0;

        type Draft = { product: Product; deltaQty: number; capped: boolean };
        const drafts: Draft[] = eligible.map((p) => {
            const cost = p.averageCost ?? 0;
            const rawDelta = cost > 0 ? Math.round(perLineBs / cost) : 0;
            // Cap: stock no puede quedar negativo
            const minDelta = -(p.currentStock ?? 0);
            const capped = rawDelta < minDelta;
            const deltaQty = capped ? minDelta : rawDelta;
            return { product: p, deltaQty, capped };
        });

        // ── Drift correction: redistribuir el residuo de redondeo en pasos ±1
        // entre productos NO topados, eligiendo en cada iteración la operación
        // que minimice |drift|. Mismo patrón que generate-random-sales.
        const lineBs = (d: Draft) => (d.product.averageCost ?? 0) * d.deltaQty;
        const totalBs = (ds: Draft[]) => ds.reduce((s, d) => s + lineBs(d), 0);

        for (let safety = 0; safety < 1000; safety++) {
            const drift = deltaTotalBs - totalBs(drafts);
            if (Math.abs(drift) < 0.01) break;

            let best: { idx: number; delta: 1 | -1 } | null = null;
            let bestAbs = Math.abs(drift);

            for (let i = 0; i < drafts.length; i++) {
                const d = drafts[i];
                const cost = d.product.averageCost ?? 0;
                if (cost <= 0) continue;

                // +1 baja drift en cost (siempre permitido)
                const absAdd = Math.abs(drift - cost);
                if (absAdd < bestAbs) {
                    best = { idx: i, delta: 1 };
                    bestAbs = absAdd;
                }

                // −1 sube drift en cost (sólo si no entra en negativo)
                const newStockAfterMinus = (d.product.currentStock ?? 0) + d.deltaQty - 1;
                if (newStockAfterMinus >= 0) {
                    const absSub = Math.abs(drift + cost);
                    if (absSub < bestAbs) {
                        best = { idx: i, delta: -1 };
                        bestAbs = absSub;
                    }
                }
            }

            if (!best) break;
            drafts[best.idx].deltaQty += best.delta;
            // Recalcular cap por si la operación restauró el delta a un valor permitido
            const d = drafts[best.idx];
            const minDelta = -(d.product.currentStock ?? 0);
            d.capped = d.deltaQty < minDelta + 0.5 && d.deltaQty <= minDelta;
        }

        // ── Construir líneas finales ordenadas por valor actual descendente
        const lines: StockAdjustmentLine[] = drafts
            .map((d): StockAdjustmentLine => {
                const cost = ROUND4(d.product.averageCost ?? 0);
                const stock = d.product.currentStock ?? 0;
                const newStock = stock + d.deltaQty;
                return {
                    productId:      d.product.id ?? '',
                    productCode:    d.product.code,
                    productName:    d.product.name,
                    departmentName: d.product.departmentName ?? '',
                    currentStock:   stock,
                    averageCost:    cost,
                    currentValueBs: ROUND2(stock * cost),
                    deltaQty:       d.deltaQty,
                    newStock,
                    newValueBs:     ROUND2(newStock * cost),
                    capped:         d.capped,
                };
            })
            .sort((a, b) => b.currentValueBs - a.currentValueBs);

        const appliedDeltaBs = drafts.reduce((s, d) => s + lineBs(d), 0);
        const residualBs = deltaTotalBs - appliedDeltaBs;
        const cappedCount = drafts.filter((d) => d.capped).length;

        return Result.success({
            period,
            baseSource,
            baseBs:          ROUND2(baseBs),
            targetBs:        ROUND2(targetBs),
            currentStockBs:  ROUND2(currentStockBs),
            deltaTotalBs:    ROUND2(deltaTotalBs),
            appliedDeltaBs:  ROUND2(appliedDeltaBs),
            residualBs:      ROUND2(residualBs),
            cappedCount,
            lines,
        });
    }
}
