// generate-random-sales.use-case — propone una lista de salidas aleatorias
// distribuidas en un periodo, ajustando el factor de venta para que la suma
// (Total Salidas S/IVA Bs.) iguale un monto objetivo o un margen sobre las
// entradas del periodo. NO persiste — devuelve el preview que el usuario
// confirma o regenera con otro seed desde la UI.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IProductRepository } from '../domain/repository/product.repository';
import { IMovementRepository } from '../domain/repository/movement.repository';
import { Product } from '../domain/product';

export interface GenerateRandomSalesInput {
    companyId: string;
    period:    string;            // YYYY-MM
    mode:      'monto' | 'margen';
    target:    number;            // Bs si mode='monto'; % si mode='margen'
    count?:    number;            // cantidad de líneas (opcional)
    seed?:     number;            // 32-bit unsigned para regenerar determinísticamente
}

export interface RandomSalesPreviewLine {
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
    period:         string;
    inboundTotalBs: number;
    targetBs:       number;
    factor:         number;          // precio venta / costo promedio (uniforme)
    seed:           number;
    lines:          RandomSalesPreviewLine[];
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

        // ── N (cantidad de líneas)
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

        // ── Generar drafts
        const [yearStr, monthStr] = period.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        const dim = new Date(year, month, 0).getDate();

        type Draft = { product: Product; quantity: number; date: string; costoLinea: number; };
        const drafts: Draft[] = [];
        for (let i = 0; i < N; i++) {
            const p = eligible[Math.floor(rand() * eligible.length)];
            const stock = Math.max(1, Math.floor(p.currentStock));
            const cap = Math.max(1, Math.ceil(stock * 0.4));
            const qty = 1 + Math.floor(rand() * cap);
            const day = 1 + Math.floor(rand() * dim);
            const date = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
            const costoLinea = qty * (p.averageCost ?? 0);
            drafts.push({ product: p, quantity: qty, date, costoLinea });
        }

        const sumCostos = drafts.reduce((s, d) => s + d.costoLinea, 0);
        if (sumCostos <= 0) return Result.fail('No se pudieron generar líneas con costo > 0');

        const factor = T / sumCostos;

        // ── Construir líneas finales
        const lines: RandomSalesPreviewLine[] = drafts
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((d) => {
                const precioVentaUnitario = ROUND4((d.product.averageCost ?? 0) * factor);
                const totalSinIVA = ROUND2(precioVentaUnitario * d.quantity);
                const ivaPct = d.product.vatType === 'general' ? 0.16 : 0;
                const iva = ROUND2(totalSinIVA * ivaPct);
                return {
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

        // ── Ajustar última línea para absorber el residuo de redondeo
        // y garantizar que SUM(totalSinIVA) === T (a 2 decimales).
        const sumPre = lines.reduce((s, l) => s + l.totalSinIVA, 0);
        const diff = ROUND2(ROUND2(T) - sumPre);
        if (diff !== 0 && lines.length > 0) {
            const last = lines[lines.length - 1];
            const adjustedTotal = ROUND2(last.totalSinIVA + diff);
            // Si el ajuste deja el total ≤ 0 movemos el residuo a la primera línea positiva
            const sink = adjustedTotal > 0 ? last : lines.find((l) => l.totalSinIVA + diff > 0) ?? last;
            sink.totalSinIVA = ROUND2(sink.totalSinIVA + diff);
            sink.precioVentaUnitario = sink.quantity > 0
                ? ROUND4(sink.totalSinIVA / sink.quantity)
                : sink.precioVentaUnitario;
            const ivaPct = sink.vatType === 'general' ? 0.16 : 0;
            sink.iva = ROUND2(sink.totalSinIVA * ivaPct);
            sink.totalConIVA = ROUND2(sink.totalSinIVA + sink.iva);
        }

        return Result.success({
            period,
            inboundTotalBs: ROUND2(inboundTotal),
            targetBs:       ROUND2(T),
            factor:         ROUND4(factor),
            seed,
            lines,
        });
    }
}
