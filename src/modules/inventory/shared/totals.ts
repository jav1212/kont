// totals.ts — pure math for invoice/movement adjustments and IVA composition.
// This file is shared between frontend forms and the SQL save RPC (whose body
// mirrors these formulas). Keep it dependency-free and stateless.
//
// Composition order (per requirement):
//   base       = qty × unitCost                (unitCost is always net, in Bs)
//   − descuento (% sobre base | Bs)
//   + recargo   (% sobre base | Bs)
//   = baseIVA (línea, sin spread del header)
//   ⇒ después se aplica el spread proporcional de descuento/recargo del header
//   = baseIVA final
//   + IVA       (alícuota × baseIVA final)
//   = total
//
// IVA incluido: cuando la UI marca un ítem con `ivaIncluido=true`, el form
// convierte el costo_unitario bruto a neto antes de persistir. La math de
// abajo trabaja siempre con `unitCost` neto.

export type AdjustmentKind = 'monto' | 'porcentaje';

export interface LineAdjustments {
    descuentoTipo:  AdjustmentKind | null;
    descuentoValor: number;
    recargoTipo:    AdjustmentKind | null;
    recargoValor:   number;
}

export interface HeaderAdjustments {
    descuentoTipo:  AdjustmentKind | null;
    descuentoValor: number;
    recargoTipo:    AdjustmentKind | null;
    recargoValor:   number;
}

export type VatRate = 'exenta' | 'reducida_8' | 'general_16';

export function vatRatePct(rate: VatRate): number {
    if (rate === 'reducida_8') return 8;
    if (rate === 'general_16') return 16;
    return 0;
}

export function emptyLineAdjustments(): LineAdjustments {
    return {
        descuentoTipo: null, descuentoValor: 0,
        recargoTipo:   null, recargoValor:   0,
    };
}

export function emptyHeaderAdjustments(): HeaderAdjustments {
    return {
        descuentoTipo: null, descuentoValor: 0,
        recargoTipo:   null, recargoValor:   0,
    };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round4 = (n: number) => Math.round(n * 10000) / 10000;
export const roundN = (n: number, decimals: number) => {
    if (!isFinite(n)) return n;
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
};

function resolveAmount(
    tipo: AdjustmentKind | null,
    valor: number,
    baseFor: number,
    decimals = 2,
): number {
    if (!tipo || !Number.isFinite(valor) || valor <= 0) return 0;
    if (tipo === 'porcentaje') return roundN((baseFor * valor) / 100, decimals);
    return roundN(valor, decimals);
}

// netFromGross: convierte costo bruto (con IVA incluido) a costo neto.
// Útil cuando el form marca "IVA incluido" — convierte al cambiar el toggle
// y persiste siempre el neto.
export function netFromGross(grossUnit: number, vatRate: VatRate): number {
    const pct = vatRatePct(vatRate);
    if (pct === 0) return round4(grossUnit);
    return round4(grossUnit / (1 + pct / 100));
}

// grossFromNet: inverso de netFromGross (para mostrar el bruto cuando el
// toggle está en "IVA incluido").
export function grossFromNet(netUnit: number, vatRate: VatRate): number {
    const pct = vatRatePct(vatRate);
    if (pct === 0) return round4(netUnit);
    return round4(netUnit * (1 + pct / 100));
}

// ── Per-line totals (sin header spread) ─────────────────────────────────────

export interface LineInput {
    quantity:    number;
    unitCost:    number;     // siempre neto (Bs)
    vatRate:     VatRate;
    adjustments: LineAdjustments;
}

export interface LineTotals {
    base:           number;  // qty × unitCost
    descuentoMonto: number;
    recargoMonto:   number;
    baseIVA:        number;  // base − desc + rec (sin header spread)
    ivaMonto:       number;  // alícuota × baseIVA (sin header spread)
    total:          number;  // baseIVA + ivaMonto (sin header spread)
}

export function computeLineTotals(input: LineInput, decimals = 2): LineTotals {
    const r = (n: number) => roundN(n, decimals);

    const base = r(input.quantity * input.unitCost);

    const descuentoMonto = resolveAmount(
        input.adjustments.descuentoTipo,
        input.adjustments.descuentoValor,
        base,
        decimals,
    );
    const recargoMonto = resolveAmount(
        input.adjustments.recargoTipo,
        input.adjustments.recargoValor,
        base,
        decimals,
    );

    const baseIVA  = r(base - descuentoMonto + recargoMonto);
    const ivaMonto = r((baseIVA * vatRatePct(input.vatRate)) / 100);
    const total    = r(baseIVA + ivaMonto);

    return { base, descuentoMonto, recargoMonto, baseIVA, ivaMonto, total };
}

// ── Header adjustments (proportional pre-IVA spread) ────────────────────────

// Prorratea el descuento/recargo del header sobre las baseIVA de
// línea, devuelve para cada línea su baseIVA final (con header spread) y el
// IVA recalculado sobre esa baseIVA. También devuelve los montos resueltos
// del header (en Bs) para persistir en la cabecera.

export interface InvoiceLineComputed extends LineTotals {
    headerDescuentoShare: number;
    headerRecargoShare:   number;
    baseIVAFinal:         number;  // baseIVA − headerDesc + headerRec
    ivaMontoFinal:        number;  // alícuota × baseIVAFinal
    totalFinal:           number;  // baseIVAFinal + ivaMontoFinal
}

export interface InvoiceTotals {
    items:           InvoiceLineComputed[];
    subtotalBruto:   number;  // Σ base por línea
    descuentoLinea:  number;  // Σ descuentoMonto línea
    recargoLinea:    number;  // Σ recargoMonto línea
    descuentoHeader: number;
    recargoHeader:   number;
    baseIVA:         number;  // Σ baseIVAFinal
    ivaPorAlicuota:  { exenta: number; reducida_8: number; general_16: number };
    ivaMonto:        number;  // Σ ivaMontoFinal
    total:           number;  // baseIVA + ivaMonto
}

export function computeInvoiceTotals(
    lines: Array<LineInput>,
    header: HeaderAdjustments,
    decimals = 2,
): InvoiceTotals {
    const r = (n: number) => roundN(n, decimals);

    // Step 1: per-line totals sin header
    const computed: LineTotals[] = lines.map((l) => computeLineTotals(l, decimals));

    const sumBaseIVA = computed.reduce((acc, c) => acc + c.baseIVA, 0);

    // Step 2: header adjustments resueltos sobre la sumBaseIVA
    const descuentoHeader = resolveAmount(header.descuentoTipo, header.descuentoValor, sumBaseIVA, decimals);
    const recargoHeader   = resolveAmount(header.recargoTipo,   header.recargoValor,   sumBaseIVA, decimals);

    // Step 3: prorratear header sobre cada línea por peso de baseIVA
    const items: InvoiceLineComputed[] = computed.map((c, idx) => {
        const weight = sumBaseIVA > 0 ? c.baseIVA / sumBaseIVA : 0;

        // Para evitar drift de redondeo, la última línea absorbe el residuo.
        const isLast = idx === computed.length - 1;
        const sharePart = (total: number) => {
            if (sumBaseIVA <= 0) return 0;
            if (isLast) {
                // residuo: total − suma de shares ya repartidas
                const sharedSoFar = computed
                    .slice(0, idx)
                    .reduce((acc, ci) => acc + r((ci.baseIVA / sumBaseIVA) * total), 0);
                return r(total - sharedSoFar);
            }
            return r(weight * total);
        };

        const headerDescuentoShare = sharePart(descuentoHeader);
        const headerRecargoShare   = sharePart(recargoHeader);

        const baseIVAFinal  = r(c.baseIVA - headerDescuentoShare + headerRecargoShare);
        const ivaMontoFinal = r((baseIVAFinal * vatRatePct(lines[idx].vatRate)) / 100);
        const totalFinal    = r(baseIVAFinal + ivaMontoFinal);

        return {
            ...c,
            headerDescuentoShare,
            headerRecargoShare,
            baseIVAFinal,
            ivaMontoFinal,
            totalFinal,
        };
    });

    const subtotalBruto  = r(computed.reduce((a, c) => a + c.base, 0));
    const descuentoLinea = r(computed.reduce((a, c) => a + c.descuentoMonto, 0));
    const recargoLinea   = r(computed.reduce((a, c) => a + c.recargoMonto, 0));

    const baseIVA  = r(items.reduce((a, c) => a + c.baseIVAFinal, 0));
    const ivaMonto = r(items.reduce((a, c) => a + c.ivaMontoFinal, 0));

    const ivaPorAlicuota = { exenta: 0, reducida_8: 0, general_16: 0 };
    items.forEach((c, idx) => {
        ivaPorAlicuota[lines[idx].vatRate] = r(ivaPorAlicuota[lines[idx].vatRate] + c.ivaMontoFinal);
    });

    return {
        items,
        subtotalBruto,
        descuentoLinea,
        recargoLinea,
        descuentoHeader,
        recargoHeader,
        baseIVA,
        ivaPorAlicuota,
        ivaMonto,
        total: r(baseIVA + ivaMonto),
    };
}
