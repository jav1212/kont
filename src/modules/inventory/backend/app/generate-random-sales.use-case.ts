// generate-random-sales.use-case — propone una lista de salidas aleatorias
// distribuidas en un periodo. El precio de venta unitario se fija en
// costo × (1 + markupPct/100) para cada producto, y la cantidad de cada
// línea se deriva para que el monto en Bs (sin IVA) quede repartido
// equitativamente entre todas las líneas: cada línea contribuye ≈ subT/N.
//
// NO persiste — devuelve el preview que el usuario confirma o regenera con
// otro seed desde la UI.
//
// Soporta carve-out de autoconsumo: el usuario puede reservar parte del
// target T (por % o por monto Bs) a movimientos de tipo 'autoconsumo'. La
// partición de productos elegibles es disjunta — un producto va completo a
// salidas o a autoconsumo, nunca a ambos.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IProductRepository } from '../domain/repository/product.repository';
import { IMovementRepository } from '../domain/repository/movement.repository';
import { Product } from '../domain/product';

export type AutoconsumoMode = 'none' | 'porcentaje' | 'monto';

export interface GenerateRandomSalesInput {
    companyId: string;
    period:    string;            // YYYY-MM
    mode:      'monto' | 'margen';
    target:    number;            // Bs si mode='monto'; % si mode='margen'
    markupPct?: number;           // % de markup unitario sobre costo (default 30 → precio = costo × 1,30)
    count?:    number;            // cantidad de líneas (opcional, total: salidas + autoconsumo)
    seed?:     number;            // 32-bit unsigned para regenerar determinísticamente
    autoconsumoMode?:   AutoconsumoMode;
    autoconsumoTarget?: number;   // % del target T si 'porcentaje'; Bs sin IVA si 'monto'
}

export interface RandomSalesPreviewLine {
    tipo:                'salida' | 'autoconsumo';
    productId:           string;
    productCode:         string;
    productName:         string;
    vatType:             'general' | 'exento';
    date:                string;     // YYYY-MM-DD
    quantity:            number;
    unitCost:            number;     // costo promedio (Bs/unidad)
    precioVentaUnitario: number;     // precio de venta sin IVA (Bs/unidad) — costo × markupFactor
    totalSinIVA:         number;     // precioVentaUnitario × quantity (Bs)
    iva:                 number;     // totalSinIVA × (16% si general, 0 si exento)
    totalConIVA:         number;     // totalSinIVA + iva
    currentStock:        number;     // existencia disponible al momento del preview
    stockShortfall:      number;     // unidades que faltan = max(0, quantity − currentStock)
}

export interface RandomSalesPreview {
    period:             string;
    inboundTotalBs:     number;
    targetBs:           number;       // T (total combinado)
    salidasTotalBs:     number;       // T − autoconsumoTotalBs
    autoconsumoTotalBs: number;       // Bs sin IVA reservados a autoconsumo (0 si mode='none')
    markupPct:          number;       // % markup aplicado uniformemente
    factor:             number;       // = 1 + markupPct/100 (precio = costo × factor en TODAS las líneas)
    seed:               number;
    lines:              RandomSalesPreviewLine[];           // tipo='salida'
    autoconsumoLines:   RandomSalesPreviewLine[];           // tipo='autoconsumo'
}

// Linear congruential RNG — determinístico, suficiente para el muestreo aleatorio.
function createRng(seed: number) {
    let s = seed >>> 0 || 1;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

const ROUND2 = (n: number) => Math.round(n * 100) / 100;
const ROUND4 = (n: number) => Math.round(n * 10000) / 10000;

const INBOUND_RECAP = 'Bs (entradas + devoluciones de cliente + ajustes positivos del periodo)';

type Draft = { product: Product; quantity: number; date: string };

export class GenerateRandomSalesUseCase
    extends UseCase<GenerateRandomSalesInput, RandomSalesPreview> {

    constructor(
        private readonly productRepo:  IProductRepository,
        private readonly movementRepo: IMovementRepository,
    ) { super(); }

    async execute(input: GenerateRandomSalesInput): Promise<Result<RandomSalesPreview>> {
        const { companyId, period, mode, target } = input;

        if (!companyId)                       return Result.fail('companyId es requerido');
        if (!/^\d{4}-\d{2}$/.test(period))    return Result.fail('period debe tener formato YYYY-MM');
        if (mode !== 'monto' && mode !== 'margen') return Result.fail('mode inválido');
        if (!Number.isFinite(target))         return Result.fail('target inválido');

        // ── Markup unitario: precio = costo × (1 + markupPct/100) por línea, uniforme
        const markupPct = (input.markupPct != null && Number.isFinite(input.markupPct))
            ? input.markupPct
            : 30;
        if (markupPct <= -100) return Result.fail('markupPct no puede ser ≤ -100');
        const markupFactor = 1 + markupPct / 100;

        // ── Productos elegibles: activos con stock y costo > 0
        const productsRes = await this.productRepo.findByCompany(companyId);
        if (productsRes.isFailure) return Result.fail(productsRes.getError());
        const eligible: Product[] = productsRes.getValue().filter(
            (p) => p.active && (p.currentStock ?? 0) > 0 && (p.averageCost ?? 0) > 0,
        );
        if (eligible.length === 0) {
            return Result.fail('No hay productos activos con stock y costo promedio > 0');
        }

        // ── Target absoluto en Bs sin IVA. Siempre se consulta el total de entradas del
        // periodo: en mode='margen' es la base del cálculo, en mode='monto' es informativo
        // (se muestra en el card "Entradas del periodo" del preview).
        const inRes = await this.movementRepo.getInboundTotal(companyId, period);
        if (inRes.isFailure) return Result.fail(inRes.getError());
        const inboundTotal = inRes.getValue();
        if (mode === 'margen' && inboundTotal <= 0) {
            return Result.fail(`No hay entradas en el periodo ${period} ${INBOUND_RECAP}: no se puede aplicar margen %`);
        }
        const T = mode === 'monto' ? target : inboundTotal * (1 + target / 100);
        if (T <= 0) return Result.fail('El target resultante es menor o igual a cero');

        // ── Carve-out de autoconsumo
        const autoMode: AutoconsumoMode = input.autoconsumoMode ?? 'none';
        let autoBs = 0;
        if (autoMode === 'porcentaje') {
            const pct = Number(input.autoconsumoTarget);
            if (!Number.isFinite(pct) || pct < 0) return Result.fail('autoconsumoTarget (%) inválido');
            if (pct > 100) return Result.fail('autoconsumoTarget no puede superar el 100% del target');
            autoBs = T * (pct / 100);
        } else if (autoMode === 'monto') {
            const bs = Number(input.autoconsumoTarget);
            if (!Number.isFinite(bs) || bs < 0) return Result.fail('autoconsumoTarget (Bs) inválido');
            if (bs > T) return Result.fail(`autoconsumo Bs (${ROUND2(bs)}) excede el target total (${ROUND2(T)})`);
            autoBs = bs;
        }
        autoBs = ROUND2(autoBs);
        const salidasBs = ROUND2(T - autoBs);

        if (autoBs > 0 && eligible.length < 2) {
            return Result.fail('Se requieren al menos 2 productos elegibles para separar autoconsumo');
        }

        // ── N (cantidad de líneas total: salidas + autoconsumo)
        const defaultCount = Math.max(3, Math.min(30, Math.round(eligible.length * 0.6)));
        const requestedCount = input.count != null && input.count > 0
            ? Math.min(Math.floor(input.count), eligible.length * 8)
            : defaultCount;
        const N = Math.max(1, requestedCount);

        // ── RNG
        const seed = (input.seed != null && Number.isFinite(input.seed))
            ? (Math.floor(input.seed) >>> 0)
            : (Math.floor(Math.random() * 0xffffffff) >>> 0);
        const rand = createRng(seed);

        // ── Particionar productos disjuntos: shuffle Fisher–Yates y separar por proporción
        const shuffled = [...eligible];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        let autoCount = 0;
        if (autoBs > 0) {
            const ratio = autoBs / T;
            const raw = Math.round(shuffled.length * ratio);
            const minAuto = 1;
            const maxAuto = salidasBs > 0 ? shuffled.length - 1 : shuffled.length;
            autoCount = Math.max(minAuto, Math.min(maxAuto, raw));
        }
        const autoProducts   = shuffled.slice(0, autoCount);
        const salidasProducts = shuffled.slice(autoCount);

        // ── Distribuir N líneas entre las dos sub-listas según los Bs reservados
        const linesForSalidas    = salidasBs > 0 ? Math.max(1, Math.round(N * (salidasBs / T))) : 0;
        const linesForAutoconsumo = autoBs > 0
            ? Math.max(1, N - linesForSalidas)
            : 0;
        const finalLinesSalidas    = salidasProducts.length > 0 ? linesForSalidas : 0;
        const finalLinesAutoconsumo = autoProducts.length    > 0 ? linesForAutoconsumo : 0;

        if (salidasBs > 0 && finalLinesSalidas === 0) {
            return Result.fail('No se pudieron asignar líneas de salida: revisa los productos elegibles');
        }
        if (autoBs > 0 && finalLinesAutoconsumo === 0) {
            return Result.fail('No se pudieron asignar líneas de autoconsumo: revisa los productos elegibles');
        }

        // ── Setup de fechas
        const [yearStr, monthStr] = period.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        const dim = new Date(year, month, 0).getDate();

        // ── Generar drafts: Bs equitativos por línea (subT/N), qty deriva de subT/N ÷ precio.
        // El stock NO limita la cantidad — para empresas que recién empiezan a usar el sistema
        // sin historial completo, es esperable que la cantidad propuesta supere el stock actual.
        // El shortfall (cuántas unidades faltan) se reporta por línea para que el contador sepa
        // cuánta mercancía adicional debería existir físicamente para soportar las ventas.
        // Selección de productos: round-robin sobre el pool (cada producto al menos una vez
        // antes de repetir) para distribuir uniformemente la generación.
        const buildDrafts = (pool: Product[], count: number, subT: number): Draft[] => {
            if (pool.length === 0 || count === 0 || subT <= 0) return [];
            const perLineBs = subT / count;

            // Pool barajeado para round-robin determinístico (con la misma seed)
            const poolShuffled = [...pool];
            for (let i = poolShuffled.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                [poolShuffled[i], poolShuffled[j]] = [poolShuffled[j], poolShuffled[i]];
            }

            const drafts: Draft[] = [];
            for (let i = 0; i < count; i++) {
                const p = poolShuffled[i % poolShuffled.length];
                const cost = p.averageCost ?? 0;
                const precio = cost * markupFactor;
                const qtyRaw = precio > 0 ? Math.round(perLineBs / precio) : 1;
                const qty = Math.max(1, qtyRaw);
                const day = 1 + Math.floor(rand() * dim);
                const date = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
                drafts.push({ product: p, quantity: qty, date });
            }

            // Redistribuir drift de redondeo en cantidades enteras. En cada paso, elegir la
            // operación (+1 ó −1 en alguna línea) que MINIMICE |drift| y detener cuando no
            // exista una mejora posible. Esto evita que una sola línea actúe como sumidero
            // absorbiendo cientos de unidades de drift, manteniendo la distribución uniforme.
            const lineBs = (d: Draft) => (d.product.averageCost ?? 0) * markupFactor * d.quantity;
            const totalBs = (ds: Draft[]) => ds.reduce((s, d) => s + lineBs(d), 0);
            const precioOf = (d: Draft) => (d.product.averageCost ?? 0) * markupFactor;

            for (let safety = 0; safety < 1000; safety++) {
                const drift = subT - totalBs(drafts);
                if (Math.abs(drift) < 0.01) break;

                let best: { idx: number; delta: 1 | -1 } | null = null;
                let bestAbs = Math.abs(drift);

                for (let i = 0; i < drafts.length; i++) {
                    const p = precioOf(drafts[i]);
                    if (p <= 0) continue;

                    // Probar +1: drift baja en p
                    const absAdd = Math.abs(drift - p);
                    if (absAdd < bestAbs) {
                        best = { idx: i, delta: 1 };
                        bestAbs = absAdd;
                    }

                    // Probar −1: drift sube en p (sólo si qty > 1)
                    if (drafts[i].quantity > 1) {
                        const absSub = Math.abs(drift + p);
                        if (absSub < bestAbs) {
                            best = { idx: i, delta: -1 };
                            bestAbs = absSub;
                        }
                    }
                }

                if (!best) break;
                drafts[best.idx].quantity += best.delta;
            }

            return drafts;
        };

        const draftsSalidas    = buildDrafts(salidasProducts, finalLinesSalidas, salidasBs);
        const draftsAutoconsumo = buildDrafts(autoProducts,    finalLinesAutoconsumo, autoBs);

        // ── Construir líneas finales: precio uniforme, sin ajuste de residuo en precio.
        // Acumula stockShortfall por producto para repartir entre las líneas que comparten
        // el mismo producto: si un producto aparece en N drafts y la suma de qty supera el
        // stock, cada línea reporta su porción proporcional del faltante.
        const buildLines = (
            drafts: Draft[],
            tipo: 'salida' | 'autoconsumo',
        ): RandomSalesPreviewLine[] => {
            // Suma de qty por producto, para distribuir el shortfall entre líneas duplicadas
            const qtyByProduct = new Map<string, number>();
            for (const d of drafts) {
                const key = d.product.id ?? d.product.code;
                qtyByProduct.set(key, (qtyByProduct.get(key) ?? 0) + d.quantity);
            }

            return drafts
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((d) => {
                    const cost = d.product.averageCost ?? 0;
                    const precioVentaUnitario = ROUND4(cost * markupFactor);
                    const totalSinIVA = ROUND2(precioVentaUnitario * d.quantity);
                    const ivaPct = d.product.vatType === 'general' ? 0.16 : 0;
                    const iva = ROUND2(totalSinIVA * ivaPct);

                    const key = d.product.id ?? d.product.code;
                    const totalQty = qtyByProduct.get(key) ?? d.quantity;
                    const totalShortfall = Math.max(0, totalQty - (d.product.currentStock ?? 0));
                    // Repartir el shortfall proporcional a la cantidad de cada línea
                    const lineShortfall = totalQty > 0
                        ? ROUND4((d.quantity / totalQty) * totalShortfall)
                        : 0;

                    return {
                        tipo,
                        productId:           d.product.id ?? '',
                        productCode:         d.product.code,
                        productName:         d.product.name,
                        vatType:             d.product.vatType,
                        date:                d.date,
                        quantity:            d.quantity,
                        unitCost:            ROUND4(cost),
                        precioVentaUnitario,
                        totalSinIVA,
                        iva,
                        totalConIVA:         ROUND2(totalSinIVA + iva),
                        currentStock:        d.product.currentStock,
                        stockShortfall:      lineShortfall,
                    };
                });
        };

        const lines            = buildLines(draftsSalidas,    'salida');
        const autoconsumoLines = buildLines(draftsAutoconsumo, 'autoconsumo');

        return Result.success({
            period,
            inboundTotalBs:     ROUND2(inboundTotal),
            targetBs:           ROUND2(T),
            salidasTotalBs:     ROUND2(salidasBs),
            autoconsumoTotalBs: ROUND2(autoBs),
            markupPct:          markupPct,
            factor:             ROUND4(markupFactor),
            seed,
            lines,
            autoconsumoLines,
        });
    }
}
