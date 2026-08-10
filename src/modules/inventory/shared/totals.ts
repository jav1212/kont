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
import { isLocalCurrency, normalizeCurrencyCode, rateForCurrency, type AppliedExchangeRate, type CurrencyCode } from './currency';

export type AdjustmentCurrency = CurrencyCode;
export type InvoiceCurrency = CurrencyCode;

export type TaxBase = 'pre_iva' | 'post_iva';

export interface InvoiceTax {
    nombre: string;
    tipo:   AdjustmentKind;
    valor:  number;
    moneda: AdjustmentCurrency;
    base:   TaxBase;
    monto:  number;
}

export function emptyInvoiceTax(): InvoiceTax {
    return { nombre: '', tipo: 'porcentaje', valor: 0, moneda: 'B', base: 'pre_iva', monto: 0 };
}

export interface LineAdjustments {
    descuentoTipo:  AdjustmentKind | null;
    descuentoValor: number;
    descuentoMoneda: AdjustmentCurrency;
    recargoTipo:    AdjustmentKind | null;
    recargoValor:   number;
    recargoMoneda: AdjustmentCurrency;
}

export interface HeaderAdjustments {
    descuentoTipo:  AdjustmentKind | null;
    descuentoValor: number;
    descuentoMoneda: AdjustmentCurrency;
    recargoTipo:    AdjustmentKind | null;
    recargoValor:   number;
    recargoMoneda: AdjustmentCurrency;
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
        descuentoMoneda: 'B',
        recargoTipo:   null, recargoValor:   0,
        recargoMoneda: 'B',
    };
}

export function emptyHeaderAdjustments(): HeaderAdjustments {
    return {
        descuentoTipo: null, descuentoValor: 0,
        descuentoMoneda: 'B',
        recargoTipo:   null, recargoValor:   0,
        recargoMoneda: 'B',
    };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round4 = (n: number) => Math.round(n * 10000) / 10000;
export const roundN = (n: number, decimals: number) => {
    if (!isFinite(n)) return n;
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
};

// Fiscal amounts in the purchase book are truncated at the final 2-decimal step.
// Intermediate calculations keep the configured precision (normally 4 decimals).
export const truncateN = (n: number, decimals: number) => {
    if (!isFinite(n)) return n;
    const factor = Math.pow(10, decimals);
    return Math.trunc(n * factor) / factor;
};

function resolveAmount(
    tipo: AdjustmentKind | null,
    valor: number,
    baseFor: number,
    decimals = 2,
    moneda: AdjustmentCurrency = 'B',
    dollarRate = 0,
    exchangeRates: ExchangeRateLookup = [],
): number {
    if (!tipo || !Number.isFinite(valor) || valor <= 0) return 0;
    if (tipo === 'porcentaje') return roundN((baseFor * valor) / 100, decimals);
    const selectedRate = isLocalCurrency(moneda) ? 1 : (lookupRate(moneda, exchangeRates) ?? dollarRate);
    const amount = !isLocalCurrency(moneda) ? valor * (selectedRate > 0 ? selectedRate : 0) : valor;
    return roundN(amount, decimals);
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
    currency?:   CurrencyCode;
    currencyCost?: number | null; // costo unitario en la moneda original
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

export function computeLineTotals(input: LineInput, decimals = 2, dollarRate = 0, exchangeRates: ExchangeRateLookup = []): LineTotals {
    const calculationDecimals = Math.max(4, decimals);
    const r = (n: number) => roundN(n, calculationDecimals);

    const base = r(input.quantity * input.unitCost);

    const descuentoMonto = resolveAmount(
        input.adjustments.descuentoTipo,
        input.adjustments.descuentoValor,
        base,
        decimals,
        input.adjustments.descuentoMoneda,
        dollarRate,
        exchangeRates,
    );
    const recargoMonto = resolveAmount(
        input.adjustments.recargoTipo,
        input.adjustments.recargoValor,
        base,
        decimals,
        input.adjustments.recargoMoneda,
        dollarRate,
        exchangeRates,
    );

    const baseIVA  = r(base - descuentoMonto + recargoMonto);
    const ivaMonto = r((roundN(baseIVA, 2) * vatRatePct(input.vatRate)) / 100);
    const total    = r(roundN(baseIVA, 2) + ivaMonto);

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
    total:           number;  // baseIVA + ivaMonto — total factura (lo que firma el proveedor)
    impuestos:       InvoiceTax[];
    totalImpuestos:  number;
    retencionIvaPct: number;  // 0 | 75 | 100
    retencionIva:    number;  // ivaMonto × pct/100 (post-IVA, no afecta base ni IVA débito)
    totalAPagar:     number;  // total − retencionIva (lo que efectivamente se gira al proveedor)
    currency: InvoiceCurrency;
    subtotalDivisa: number;
    descuentoLineaDivisa: number;
    recargoLineaDivisa: number;
    descuentoHeaderDivisa: number;
    recargoHeaderDivisa: number;
    baseIVADivisa: number;
    ivaPorAlicuotaDivisa: { exenta: number; reducida_8: number; general_16: number };
    ivaDivisa: number;
    impuestosDivisa: InvoiceTax[];
    totalImpuestosDivisa: number;
    retencionIvaDivisa: number;
    totalDivisa: number;
    totalAPagarDivisa: number;
}

const scaleCurrency = (value: number, rate: number) => roundN(value * rate, 4);
type ExchangeRateLookup = readonly AppliedExchangeRate[] | ((currencyCode: CurrencyCode) => number | null);

function lookupRate(currencyCode: CurrencyCode, rates: ExchangeRateLookup): number | null {
    return typeof rates === "function" ? rates(currencyCode) : rateForCurrency(currencyCode, rates);
}

export function computeInvoiceTotals(
    lines: Array<LineInput>,
    header: HeaderAdjustments,
    decimals = 2,
    retencionIvaPct = 0,
    impuestos: InvoiceTax[] = [],
    dollarRate = 0,
    invoiceCurrency: InvoiceCurrency = 'B',
    exchangeRates: ExchangeRateLookup = [],
): InvoiceTotals {
    // For USD invoices, calculate every component in USD first. The complete
    // result is converted once at the end, using the BCV rate with 4 decimals.
    if (!isLocalCurrency(invoiceCurrency)) {
        const rate = Number.isFinite(dollarRate) ? roundN(dollarRate, 4) : 0;
        const sourceLines = lines.map((line) => ({
            ...line,
            currency: normalizeCurrencyCode(invoiceCurrency),
            unitCost: Number.isFinite(line.currencyCost ?? NaN)
                ? Number(line.currencyCost)
                : (rate > 0 ? line.unitCost / rate : 0),
            currencyCost: Number.isFinite(line.currencyCost ?? NaN)
                ? Number(line.currencyCost)
                : (rate > 0 ? line.unitCost / rate : 0),
            adjustments: {
                ...line.adjustments,
                descuentoMoneda: normalizeCurrencyCode(invoiceCurrency),
                recargoMoneda: normalizeCurrencyCode(invoiceCurrency),
            },
        }));
        const sourceHeader: HeaderAdjustments = {
            ...header,
            descuentoMoneda: normalizeCurrencyCode(invoiceCurrency),
            recargoMoneda: normalizeCurrencyCode(invoiceCurrency),
        };
        const sourceTaxes = impuestos.map((tax) => ({ ...tax, moneda: normalizeCurrencyCode(invoiceCurrency) }));
        const sourceDecimals = Math.max(decimals, 8);
        const source = computeInvoiceTotals(sourceLines, sourceHeader, sourceDecimals, retencionIvaPct, sourceTaxes, 1, 'B', []);
        const bs = (value: number) => scaleCurrency(value, rate);
        const bsFiscal = (value: number) => roundN(value * rate, 2);
        const items = source.items.map((item) => ({
            ...item,
            base: bs(item.base),
            descuentoMonto: bs(item.descuentoMonto),
            recargoMonto: bs(item.recargoMonto),
            baseIVA: bs(item.baseIVA),
            ivaMonto: bs(item.ivaMonto),
            total: bs(item.total),
            headerDescuentoShare: bs(item.headerDescuentoShare),
            headerRecargoShare: bs(item.headerRecargoShare),
            baseIVAFinal: bs(item.baseIVAFinal),
            ivaMontoFinal: bs(item.ivaMontoFinal),
            totalFinal: bs(item.totalFinal),
        }));
        const ivaPorAlicuota = {
            exenta: bs(source.ivaPorAlicuota.exenta),
            reducida_8: bs(source.ivaPorAlicuota.reducida_8),
            general_16: bs(source.ivaPorAlicuota.general_16),
        };
        return {
            ...source,
            items,
            currency: normalizeCurrencyCode(invoiceCurrency),
            subtotalBruto: bsFiscal(source.subtotalBruto),
            descuentoLinea: bsFiscal(source.descuentoLinea),
            recargoLinea: bsFiscal(source.recargoLinea),
            descuentoHeader: bsFiscal(source.descuentoHeader),
            recargoHeader: bsFiscal(source.recargoHeader),
            baseIVA: bsFiscal(source.baseIVA),
            ivaPorAlicuota,
            ivaMonto: bsFiscal(source.ivaMonto),
            impuestos: source.impuestos.map((tax) => ({ ...tax, monto: bsFiscal(tax.monto) })),
            totalImpuestos: bsFiscal(source.totalImpuestos),
            retencionIva: bsFiscal(source.retencionIva),
            total: bsFiscal(source.total),
            totalAPagar: bsFiscal(source.totalAPagar),
            subtotalDivisa: source.subtotalBruto,
            descuentoLineaDivisa: source.descuentoLinea,
            recargoLineaDivisa: source.recargoLinea,
            descuentoHeaderDivisa: source.descuentoHeader,
            recargoHeaderDivisa: source.recargoHeader,
            baseIVADivisa: source.baseIVA,
            ivaPorAlicuotaDivisa: source.ivaPorAlicuota,
            ivaDivisa: source.ivaMonto,
            impuestosDivisa: source.impuestos,
            totalImpuestosDivisa: source.totalImpuestos,
            retencionIvaDivisa: source.retencionIva,
            totalDivisa: source.total,
            totalAPagarDivisa: source.totalAPagar,
        };
    }
    const calculationDecimals = Math.max(4, decimals);
    const r = (n: number) => roundN(n, calculationDecimals);

    // Convertimos una sola vez el agregado USD, y distribuimos su equivalente
    // en Bs entre las l�neas USD. As� subtotal/total y persistencia no dependen
    // del redondeo de cada conversi�n individual.
    const usdLines = lines.map((line, index) => ({ line, index }))
        .filter(({ line }) => !isLocalCurrency(line.currency));
    const normalizedLines = lines.map((line) => {
        if (isLocalCurrency(line.currency) || usdLines.length === 0 || dollarRate <= 0) return line;
        const rate = dollarRate > 0 ? dollarRate : 0;
        const sourceUnit = Number.isFinite(line.currencyCost ?? NaN)
            ? Number(line.currencyCost)
            : (rate > 0 ? line.unitCost / rate : 0);
        const sourceTotal = Math.max(0, line.quantity) * Math.max(0, sourceUnit);
        const sourceGrandTotal = usdLines.reduce((sum, entry) => {
            const entryRate = dollarRate > 0 ? dollarRate : 0;
            const entryUnit = Number.isFinite(entry.line.currencyCost ?? NaN)
                ? Number(entry.line.currencyCost)
                : (entryRate > 0 ? entry.line.unitCost / entryRate : 0);
            return sum + Math.max(0, entry.line.quantity) * Math.max(0, entryUnit);
        }, 0);
        const convertedGrandTotal = sourceGrandTotal * rate;
        const allocatedTotal = sourceGrandTotal > 0 ? convertedGrandTotal * sourceTotal / sourceGrandTotal : 0;
        return { ...line, unitCost: line.quantity > 0 ? allocatedTotal / line.quantity : 0 };
    });

    // Step 1: per-line totals sin header
    const computed: LineTotals[] = normalizedLines.map((l) => computeLineTotals(l, calculationDecimals, dollarRate, exchangeRates));

    const sumBaseIVA = computed.reduce((acc, c) => acc + c.baseIVA, 0);

    // Step 2: header adjustments resueltos sobre la sumBaseIVA
    const descuentoHeader = resolveAmount(header.descuentoTipo, header.descuentoValor, sumBaseIVA, calculationDecimals, header.descuentoMoneda, dollarRate, exchangeRates);
    const recargoHeader   = resolveAmount(header.recargoTipo, header.recargoValor, sumBaseIVA, calculationDecimals, header.recargoMoneda, dollarRate, exchangeRates);

    // Step 3: prorratear header sobre cada línea por peso de baseIVA
    const allUsd = normalizedLines.length > 0 && normalizedLines.every((line) => !isLocalCurrency(line.currency)) && dollarRate > 0;
    const ivaFromBase = (baseBs: number, pct: number) => {
        if (allUsd) {
            // For USD invoices, apply IVA to the fiscal USD base first, then convert it to bol�vares.
            const fiscalUsdBase = roundN(baseBs / dollarRate, 2);
            return r((fiscalUsdBase * pct / 100) * dollarRate);
        }
        const fiscalBase = roundN(baseBs, 2);
        return r(fiscalBase * pct / 100);
    };

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
        const ivaMontoFinal = ivaFromBase(baseIVAFinal, vatRatePct(normalizedLines[idx].vatRate));
        const totalFinal    = r(roundN(baseIVAFinal, 2) + ivaMontoFinal);

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

    const baseIVARaw = r(items.reduce((a, c) => a + c.baseIVAFinal, 0));

    // Keep 4-decimal intermediates and truncate only the fiscal outputs.
    const baseIVA = roundN(baseIVARaw, 2);
    let ivaMonto = 0;

    // Apply IVA once per aliquot to the accumulated fiscal base. Summing IVA
    // per line can lose a cent on multi-line invoices.
    const baseByRate = { exenta: 0, reducida_8: 0, general_16: 0 };
    items.forEach((c, idx) => {
        const rate = normalizedLines[idx].vatRate;
        baseByRate[rate] += c.baseIVAFinal;
    });
    const ivaByRateRaw = (Object.keys(baseByRate) as VatRate[]).reduce(
        (sum, rate) => sum + ivaFromBase(baseByRate[rate], vatRatePct(rate)),
        0,
    );
    const ivaMontoRawFiscal = r(ivaByRateRaw);
    const ivaPorAlicuotaFiscal = {
        exenta: 0,
        reducida_8: roundN(ivaFromBase(baseByRate.reducida_8, 8), 2),
        general_16: roundN(ivaFromBase(baseByRate.general_16, 16), 2),
    };
    ivaMonto = roundN(ivaMontoRawFiscal, decimals);
    const total = roundN(baseIVA + ivaMonto, decimals);

    const resolvedImpuestos: InvoiceTax[] = impuestos.map((tax) => {
        let monto = 0;
        if (tax.tipo === 'monto') {
            const taxRate = isLocalCurrency(tax.moneda) ? 1 : (lookupRate(tax.moneda, exchangeRates) ?? dollarRate);
            monto = r(Math.max(0, tax.valor) * (taxRate > 0 ? taxRate : 0));
        } else if (tax.tipo === 'porcentaje' && tax.valor > 0) {
            const taxBase = tax.base === 'post_iva' ? (baseIVA + ivaMonto) : baseIVA;
            monto = r(taxBase * tax.valor / 100);
        }
        return { ...tax, monto };
    });
    const totalImpuestos = r(resolvedImpuestos.reduce((acc, t) => acc + t.monto, 0));

    const safePct      = Number.isFinite(retencionIvaPct) ? Math.max(0, Math.min(100, retencionIvaPct)) : 0;
    const retencionIva = r(ivaMonto * safePct / 100);
    const totalAPagar  = r(total + totalImpuestos - retencionIva);

    return {
        items,
        subtotalBruto,
        descuentoLinea,
        recargoLinea,
        descuentoHeader,
        recargoHeader,
        baseIVA,
        ivaPorAlicuota: ivaPorAlicuotaFiscal,
        ivaMonto,
        total,
        impuestos: resolvedImpuestos,
        totalImpuestos,
        retencionIvaPct: safePct,
        retencionIva,
        totalAPagar,
        currency: 'VES',
        subtotalDivisa: subtotalBruto,
        descuentoLineaDivisa: descuentoLinea,
        recargoLineaDivisa: recargoLinea,
        descuentoHeaderDivisa: descuentoHeader,
        recargoHeaderDivisa: recargoHeader,
        baseIVADivisa: baseIVA,
        ivaPorAlicuotaDivisa: ivaPorAlicuotaFiscal,
        ivaDivisa: ivaMonto,
        impuestosDivisa: resolvedImpuestos,
        totalImpuestosDivisa: totalImpuestos,
        retencionIvaDivisa: retencionIva,
        totalDivisa: total,
        totalAPagarDivisa: totalAPagar,
    };
}
export interface FlatInvoiceTotals {
    subtotal: number;
    ivaMonto: number;
    retencionIva: number;
    total: number;
}

/** Shared calculator for invoices entered as a declared subtotal. */
export function computeFlatInvoiceTotals(subtotal: number, vatPercentage: number, retencionPercentage = 0): FlatInvoiceTotals {
    const base = roundN(Math.max(0, subtotal), 4);
    const ivaMonto = roundN(base * Math.max(0, vatPercentage) / 100, 2);
    const retencionIva = roundN(ivaMonto * Math.max(0, Math.min(100, retencionPercentage)) / 100, 2);
    return {
        subtotal: roundN(base, 2),
        ivaMonto,
        retencionIva,
        total: roundN(base + ivaMonto - retencionIva, 2),
    };
}
