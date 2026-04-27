// generate-random-sales.use-case — propone una lista de salidas aleatorias
// distribuidas en un periodo, ajustando el factor de venta para que la suma
// (Total Salidas S/IVA Bs.) iguale un monto objetivo o un margen sobre las
// entradas del periodo. NO persiste — devuelve el preview que el usuario
// confirma o regenera con otro seed desde la UI.
//
// Soporta carve-out de autoconsumo: el usuario puede reservar parte del target T
// (por % o por monto Bs) a movimientos de tipo 'autoconsumo'. La partición de
// productos elegibles es disjunta — un producto va completo a salidas o a
// autoconsumo, nunca a ambos. Esto refleja prácticas de auditoría y deja
// limpio el kardex.
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
    precioVentaUnitario: number;     // precio de venta sin IVA (Bs/unidad)
    totalSinIVA:         number;     // precioVentaUnitario × quantity (Bs)
    iva:                 number;     // totalSinIVA × (16% si general, 0 si exento)
    totalConIVA:         number;     // totalSinIVA + iva
    currentStock:        number;     // existencia disponible al momento del preview
}

export interface RandomSalesPreview {
    period:             string;
    inboundTotalBs:     number;
    targetBs:           number;       // T (total combinado)
    salidasTotalBs:     number;       // T − autoconsumoTotalBs
    autoconsumoTotalBs: number;       // Bs sin IVA reservados a autoconsumo (0 si mode='none')
    factor:             number;       // precio venta / costo promedio (uniforme)
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

type Draft = { product: Product; quantity: number; date: string; costoLinea: number; };

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

        // ── Productos elegibles: activos con stock y costo > 0
        const productsRes = await this.productRepo.findByCompany(companyId);
        if (productsRes.isFailure) return Result.fail(productsRes.getError());
        const eligible: Product[] = productsRes.getValue().filter(
            (p) => p.active && (p.currentStock ?? 0) > 0 && (p.averageCost ?? 0) > 0,
        );
        if (eligible.length === 0) {
            return Result.fail('No hay productos activos con stock y costo promedio > 0');
        }

        // ── Target absoluto en Bs sin IVA
        let inboundTotal = 0;
        if (mode === 'margen') {
            const inRes = await this.movementRepo.getInboundTotal(companyId, period);
            if (inRes.isFailure) return Result.fail(inRes.getError());
            inboundTotal = inRes.getValue();
            if (inboundTotal <= 0) {
                return Result.fail(`No hay entradas en el periodo ${period} ${INBOUND_RECAP}: no se puede aplicar margen %`);
            }
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
            // Mínimo 1 producto en autoconsumo, máximo eligible.length − 1 (al menos 1 producto en salidas si salidasBs > 0)
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
        // Si no hay productos en alguna sub-lista, mover sus líneas al otro lado
        const finalLinesSalidas    = salidasProducts.length > 0 ? linesForSalidas : 0;
        const finalLinesAutoconsumo = autoProducts.length    > 0 ? linesForAutoconsumo : 0;

        if (salidasBs > 0 && finalLinesSalidas === 0) {
            return Result.fail('No se pudieron asignar líneas de salida: revisa los productos elegibles');
        }
        if (autoBs > 0 && finalLinesAutoconsumo === 0) {
            return Result.fail('No se pudieron asignar líneas de autoconsumo: revisa los productos elegibles');
        }

        // ── Generar drafts por sub-lista
        const [yearStr, monthStr] = period.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        const dim = new Date(year, month, 0).getDate();

        const buildDrafts = (pool: Product[], count: number): Draft[] => {
            if (pool.length === 0 || count === 0) return [];
            const drafts: Draft[] = [];
            for (let i = 0; i < count; i++) {
                const p = pool[Math.floor(rand() * pool.length)];
                const stock = Math.max(1, Math.floor(p.currentStock));
                const cap = Math.max(1, Math.ceil(stock * 0.4));
                const qty = 1 + Math.floor(rand() * cap);
                const day = 1 + Math.floor(rand() * dim);
                const date = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
                drafts.push({ product: p, quantity: qty, date, costoLinea: qty * (p.averageCost ?? 0) });
            }
            return drafts;
        };

        const draftsSalidas    = buildDrafts(salidasProducts, finalLinesSalidas);
        const draftsAutoconsumo = buildDrafts(autoProducts,    finalLinesAutoconsumo);

        const sumCostos = draftsSalidas.reduce((s, d) => s + d.costoLinea, 0)
                        + draftsAutoconsumo.reduce((s, d) => s + d.costoLinea, 0);
        if (sumCostos <= 0) return Result.fail('No se pudieron generar líneas con costo > 0');

        // ── Factor único uniforme: T / Σ(costos) — mantiene precios homogéneos en ambas listas
        const factor = T / sumCostos;

        // ── Construir líneas finales por sub-lista, con ajuste de residuo independiente
        const buildLines = (
            drafts: Draft[],
            tipo: 'salida' | 'autoconsumo',
            subTotalBs: number,
        ): RandomSalesPreviewLine[] => {
            const built: RandomSalesPreviewLine[] = drafts
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((d) => {
                    const precioVentaUnitario = ROUND4((d.product.averageCost ?? 0) * factor);
                    const totalSinIVA = ROUND2(precioVentaUnitario * d.quantity);
                    const ivaPct = d.product.vatType === 'general' ? 0.16 : 0;
                    const iva = ROUND2(totalSinIVA * ivaPct);
                    return {
                        tipo,
                        productId:           d.product.id ?? '',
                        productCode:         d.product.code,
                        productName:         d.product.name,
                        vatType:             d.product.vatType,
                        date:                d.date,
                        quantity:            d.quantity,
                        unitCost:            ROUND4(d.product.averageCost ?? 0),
                        precioVentaUnitario,
                        totalSinIVA,
                        iva,
                        totalConIVA:         ROUND2(totalSinIVA + iva),
                        currentStock:        d.product.currentStock,
                    };
                });

            // Ajustar última línea para que Σ(totalSinIVA) === subTotalBs (a 2 decimales)
            const sumPre = built.reduce((s, l) => s + l.totalSinIVA, 0);
            const diff = ROUND2(ROUND2(subTotalBs) - sumPre);
            if (diff !== 0 && built.length > 0) {
                const last = built[built.length - 1];
                const adjustedTotal = ROUND2(last.totalSinIVA + diff);
                const sink = adjustedTotal > 0
                    ? last
                    : built.find((l) => l.totalSinIVA + diff > 0) ?? last;
                sink.totalSinIVA = ROUND2(sink.totalSinIVA + diff);
                sink.precioVentaUnitario = sink.quantity > 0
                    ? ROUND4(sink.totalSinIVA / sink.quantity)
                    : sink.precioVentaUnitario;
                const ivaPct = sink.vatType === 'general' ? 0.16 : 0;
                sink.iva = ROUND2(sink.totalSinIVA * ivaPct);
                sink.totalConIVA = ROUND2(sink.totalSinIVA + sink.iva);
            }
            return built;
        };

        const lines            = buildLines(draftsSalidas,    'salida',      salidasBs);
        const autoconsumoLines = buildLines(draftsAutoconsumo, 'autoconsumo', autoBs);

        return Result.success({
            period,
            inboundTotalBs:     ROUND2(inboundTotal),
            targetBs:           ROUND2(T),
            salidasTotalBs:     ROUND2(salidasBs),
            autoconsumoTotalBs: ROUND2(autoBs),
            factor:             ROUND4(factor),
            seed,
            lines,
            autoconsumoLines,
        });
    }
}
