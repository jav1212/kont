// PDF generator: Recibo de Nómina.
//
// Cada hoja OFICIO (216 × 330mm) portrait lleva DOS copias del recibo del
// mismo empleado — mitad superior "ORIGINAL" (queda con el trabajador),
// mitad inferior "COPIA" (queda con el pagador) — separadas por una línea
// punteada horizontal en Y=160mm para recortar con tijera o guillotina.
// Si los conceptos del empleado no caben en 150mm de alto, ese empleado
// cae a un fallback de dos hojas oficio completas (página 1 = Original,
// página 2 = Copia) con el layout extendido de siempre.
//
// El formato OFICIO se usa solo para este recibo (el resto de PDFs sigue
// en A4) porque permite las dos copias por hoja sin comprimir la nómina
// más allá de lo legible.
//
// Conserva los flags per-company `pdfVisibility` (REQ-005) y el switch
// `salaryMode`.

import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";
import {
    COLORS,
    drawHeader,
    drawFooter,
    drawHeaderRow,
    drawRow,
    drawCompanyLogo,
    fill,
    rect,
    formatVES,
    loadKontaLogo,
    renderText,
    renderMono,
    renderLabel,
    safeFilename,
} from "@/src/shared/frontend/utils/pdf-chrome";
import {
    OFICIO_FORMAT,
    HALF_TOP_Y,
    HALF_BOTTOM_Y,
    HALF_HEIGHT,
    CUT_LINE_Y,
    drawCutLine,
    drawCompactHeader,
    drawOriginalCopyChip,
    drawSignatures,
} from "@/src/shared/frontend/utils/pdf-receipt-chrome";
import type { PdfVisibility } from "../../backend/domain/payroll-settings";

// ── Public types ──────────────────────────────────────────────────────────────

export interface PdfComputedLine {
    label:   string;
    formula: string;
    amount:  number;
}

export interface PdfEmployeeResult {
    cedula:          string;
    nombre:          string;
    cargo:           string;
    salarioMensual:  number;
    estado:          string;
    earningLines:    PdfComputedLine[];
    bonusLines:      PdfComputedLine[];
    deductionLines:  PdfComputedLine[];
    totalEarnings:   number;
    totalBonuses:    number;
    totalDeductions: number;
    gross:           number;
    net:             number;
    netUSD:          number;
    alicuotaUtil:    number;
    alicuotaBono:    number;
    salarioIntegral: number;
}

export type PdfPayrollMode = "simple" | "duplicado";

export interface PdfPayrollOptions {
    companyName:    string;
    companyId?:     string;
    payrollDate:    string;
    periodStart?:   string;
    periodLabel?:   string;
    bcvRate?:       number;
    mondaysInMonth: number;
    receiptSerial?: string;
    salaryMode?:    "mensual" | "integral";
    logoUrl?:       string;
    showLogoInPdf?: boolean;
    pdfVisibility?: PdfVisibility;
    /**
     * "simple"     → A4 portrait, un recibo completo por hoja (layout clásico).
     * "duplicado"  → Oficio 216×330mm, dos copias (Original + Copia) por hoja
     *                con línea de corte intermedia. Es el default.
     */
    pdfMode?:       PdfPayrollMode;
}

export function makePayrollSerial(periodStart: string): string {
    const [year, month, day] = periodStart.split("-");
    const q = parseInt(day) <= 15 ? 1 : 2;
    return `NOM-${year}-${month}-Q${q}`;
}

// La geometría OFICIO (HALF_TOP_Y, HALF_BOTTOM_Y, HALF_HEIGHT, CUT_LINE_Y,
// OFICIO_FORMAT) y los helpers drawCutLine/drawCompactHeader/drawOriginalCopyChip/
// drawSignatures viven en `pdf-receipt-chrome` y se importan arriba para ser
// reutilizados por los PDFs hermanos (bonificaciones, cesta ticket, bono guerra).
// COMPACT_MAX = HALF_HEIGHT: umbral para decidir compacto vs fallback completo.

type ReceiptMode =
    | "full-single"      // modo simple: un recibo completo por hoja, sin badge
    | "full-original"    // fallback duplicado p.1 (modo "duplicado", overflow)
    | "full-copy"        // fallback duplicado p.2 (modo "duplicado", overflow)
    | "compact-top"      // mitad superior (modo "duplicado", caso normal)
    | "compact-bottom";  // mitad inferior (modo "duplicado", caso normal)

// ── Densidad de las secciones (modo normal vs compacto) ───────────────────────

interface SectionDensity {
    titleH:      number;
    headerRowH:  number;
    rowH:        number;
    gap:         number;
    fontConcept: number;
    fontFormula: number;
    fontAmount:  number;
    titleSize:   number;
    totalSize:   number;
}

const NORMAL_DENSITY: SectionDensity = {
    titleH:      6.5,
    headerRowH:  5.5,
    rowH:        5.6,
    gap:         3,
    fontConcept: 8.5,
    fontFormula: 8,
    fontAmount:  9,
    titleSize:   8,
    totalSize:   10,
};

const COMPACT_DENSITY: SectionDensity = {
    titleH:      5.5,
    headerRowH:  4.8,
    rowH:        4.8,
    gap:         1.5,
    fontConcept: 7.8,
    fontFormula: 7,
    fontAmount:  8.2,
    titleSize:   7,
    totalSize:   9,
};

// ── Section table (densidad parametrizada) ────────────────────────────────────

type Doc = jsPDF;

function drawSection(
    doc: Doc,
    x: number,
    y: number,
    w: number,
    title: string,
    lines: PdfComputedLine[],
    total: number,
    sign: "+" | "-",
    d: SectionDensity,
): number {
    // Section title bar with right-aligned total
    fill(doc, x, y, w, d.titleH, COLORS.bandHead);
    renderLabel(doc, title, x + 2, y + d.titleH - 1.9, "left", COLORS.inkMed, d.titleSize);
    renderMono(doc, `${sign} ${formatVES(total)}`, x + w - 2, y + d.titleH - 1.9, d.totalSize, true, COLORS.ink, "right");
    y += d.titleH;

    if (lines.length === 0) {
        renderText(doc, "Sin conceptos", x + 2, y + d.rowH - 1.1, d.fontConcept, false, COLORS.muted, "left", undefined, "helvetica");
        y += d.rowH;
        return y + d.gap;
    }

    // Mini table header row
    const colConcept = w * 0.42;
    const colFormula = w * 0.32;
    const colAmount  = w * 0.26;
    drawHeaderRow(doc, y, d.headerRowH, [
        { x: x,                           w: colConcept, text: "Concepto", align: "left"  },
        { x: x + colConcept,              w: colFormula, text: "Cálculo",  align: "left"  },
        { x: x + colConcept + colFormula, w: colAmount,  text: "Monto",    align: "right" },
    ]);
    y += d.headerRowH;

    lines.forEach((line, i) => {
        drawRow(doc, y, d.rowH, [
            { x: x,                           w: colConcept, text: line.label,             align: "left",  size: d.fontConcept, color: COLORS.inkMed },
            { x: x + colConcept,              w: colFormula, text: line.formula,           align: "left",  size: d.fontFormula, mono: true, color: COLORS.muted },
            { x: x + colConcept + colFormula, w: colAmount,  text: formatVES(line.amount), align: "right", size: d.fontAmount,  mono: true, bold: true, color: COLORS.ink },
        ], { zebra: i % 2 === 1 });
        y += d.rowH;
    });

    return y + d.gap;
}

// ── Estimador de altura (decide compact vs fallback) ──────────────────────────

function estimateCompactHeight(emp: PdfEmployeeResult, opts: PdfPayrollOptions, hasCompanyLogo: boolean): number {
    const headerH   = 10;                       // mini-header (chip + título + empresa + regla)
    const logoH     = hasCompanyLogo ? 7 : 0;   // logo opcional empresa (6mm + 1mm gap)
    const identityH = 12 + 2;                   // tarjeta de identidad + gap
    const netH      = 1.2 + 11 + 2;             // acento naranja + neto + gap
    const signaturesH = 16 + 2;                 // firmas compactas + gap

    const vis = opts.pdfVisibility;
    const filteredEarnings = vis
        ? emp.earningLines.filter((l) => {
              const isOvertime = l.label.startsWith("H.E.");
              if (isOvertime && vis.showOvertime === false) return false;
              return true;
          })
        : emp.earningLines;

    const d = COMPACT_DENSITY;
    const sectionH = (n: number) => d.titleH + d.headerRowH + Math.max(1, n) * d.rowH + d.gap;

    let sumSections = 0;
    if (!vis || vis.showEarnings   !== false) sumSections += sectionH(filteredEarnings.length);
    if (!vis || vis.showBonuses    !== false) sumSections += sectionH(emp.bonusLines.length);
    if (!vis || vis.showDeductions !== false) sumSections += sectionH(emp.deductionLines.length);

    return headerH + logoH + identityH + sumSections + netH + signaturesH;
}

// ── Recibo dentro de una región vertical arbitraria ───────────────────────────

function drawReceiptInRegion(
    doc: Doc,
    emp: PdfEmployeeResult,
    opts: PdfPayrollOptions,
    yStart: number,
    empIdx: number,
    companyLogo: string | null,
    mode: ReceiptMode,
): number {
    const isCompact = mode === "compact-top" || mode === "compact-bottom";
    const showBadge = mode === "compact-top" || mode === "compact-bottom"
                   || mode === "full-original" || mode === "full-copy";
    const label     = mode === "compact-top" || mode === "full-original" ? "ORIGINAL" : "COPIA";

    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX   = 12;
    const xL        = marginX;
    const xR        = pageWidth - marginX;
    const contentW  = xR - xL;

    const periodLabel = (opts.periodLabel ?? opts.payrollDate).toUpperCase();
    const empSerial   = opts.receiptSerial
        ? `${opts.receiptSerial}-${String(empIdx + 1).padStart(4, "0")}`
        : `NOM-${empIdx + 1}`;

    let y: number;

    if (isCompact) {
        // Mini-header propio (drawHeader global NO se llama para mitades).
        y = drawCompactHeader(doc, opts, xL, xR, yStart, label as "ORIGINAL" | "COPIA", periodLabel, "RECIBO DE NÓMINA");
    } else {
        // Modo completo: el caller ya llamó drawHeader. Si corresponde, colocamos el chip
        // ORIGINAL/COPIA arriba a la derecha; en modo simple no se dibuja chip.
        if (showBadge) {
            drawOriginalCopyChip(doc, xR, yStart, label as "ORIGINAL" | "COPIA");
        }
        y = yStart;
    }

    // ── Logo opcional empresa ─────────────────────────────────────────────────
    if (companyLogo) {
        drawCompanyLogo(doc, companyLogo, xL, y, isCompact ? 16 : 18, isCompact ? 6 : 7);
        y += isCompact ? 7 : 9;
    }

    // ── Tarjeta de identidad ──────────────────────────────────────────────────
    const idH = isCompact ? 12 : 16;
    fill(doc, xL, y, contentW, idH, COLORS.rowAlt);
    rect(doc, xL, y, contentW, idH, COLORS.border, 0.2);

    const colId  = xL + 3;
    const colCed = xL + contentW * 0.45;
    const colSal = xR - 3;

    const effectiveSalaryMode = opts.pdfVisibility?.showAlicuotaBreakdown === false ? "mensual" : opts.salaryMode;

    if (isCompact) {
        renderLabel(doc, "Trabajador", colId, y + 3, "left", COLORS.muted, 6);
        renderText(doc, emp.nombre.toUpperCase(), colId, y + 7, 9, true, COLORS.ink, "left", contentW * 0.42);
        if (emp.cargo) {
            renderText(doc, emp.cargo, colId, y + 10.5, 7, false, COLORS.muted, "left", contentW * 0.42, "helvetica");
        }

        renderLabel(doc, "Cédula", colCed, y + 3, "left", COLORS.muted, 6);
        renderMono(doc, emp.cedula, colCed, y + 7, 9, true, COLORS.ink, "left");
        renderMono(doc, `ID ${empSerial}`, colCed, y + 10.5, 6.5, false, COLORS.muted, "left");

        renderLabel(doc, "Salario", colSal, y + 3, "right", COLORS.muted, 6);
        if (effectiveSalaryMode === "integral") {
            renderMono(doc, formatVES(emp.salarioIntegral), colSal, y + 7, 8.5, true, COLORS.ink, "right");
            renderMono(doc, `Base: ${formatVES(emp.salarioMensual)}`, colSal, y + 10.5, 6.5, false, COLORS.muted, "right");
        } else {
            renderMono(doc, formatVES(emp.salarioMensual), colSal, y + 7, 8.5, true, COLORS.ink, "right");
            renderMono(doc, "Mensual", colSal, y + 10.5, 6.5, false, COLORS.muted, "right");
        }
    } else {
        renderLabel(doc, "Trabajador", colId, y + 4, "left", COLORS.muted, 7);
        renderText(doc, emp.nombre.toUpperCase(), colId, y + 9, 10.5, true, COLORS.ink, "left", contentW * 0.42);
        if (emp.cargo) {
            renderText(doc, emp.cargo, colId, y + 13.5, 8, false, COLORS.muted, "left", contentW * 0.42, "helvetica");
        }

        renderLabel(doc, "Cédula", colCed, y + 4, "left", COLORS.muted, 7);
        renderMono(doc, emp.cedula, colCed, y + 9, 10.5, true, COLORS.ink, "left");
        renderMono(doc, `ID  ${empSerial}`, colCed, y + 13.5, 7.5, false, COLORS.muted, "left");

        renderLabel(doc, "Salario", colSal, y + 4, "right", COLORS.muted, 7);
        if (effectiveSalaryMode === "integral") {
            renderMono(doc, formatVES(emp.salarioIntegral), colSal, y + 9, 10, true, COLORS.ink, "right");
            renderMono(doc, `Base: ${formatVES(emp.salarioMensual)}`, colSal, y + 13.5, 7.5, false, COLORS.muted, "right");
        } else {
            renderMono(doc, formatVES(emp.salarioMensual), colSal, y + 9, 10, true, COLORS.ink, "right");
            renderMono(doc, "Mensual", colSal, y + 13.5, 7.5, false, COLORS.muted, "right");
        }
    }

    y += idH + (isCompact ? 2 : 6);

    // ── Secciones ─────────────────────────────────────────────────────────────
    const density = isCompact ? COMPACT_DENSITY : NORMAL_DENSITY;
    const vis = opts.pdfVisibility;

    const filteredEarningLines = vis
        ? emp.earningLines.filter((l) => {
              const isOvertime = l.label.startsWith("H.E.");
              if (isOvertime && vis.showOvertime === false) return false;
              return true;
          })
        : emp.earningLines;

    if (!vis || vis.showEarnings !== false) {
        y = drawSection(doc, xL, y, contentW, "Asignaciones", filteredEarningLines, emp.totalEarnings, "+", density);
    }
    if (!vis || vis.showBonuses !== false) {
        y = drawSection(doc, xL, y, contentW, "Bonificaciones", emp.bonusLines, emp.totalBonuses, "+", density);
    }
    if (!vis || vis.showDeductions !== false) {
        y = drawSection(doc, xL, y, contentW, "Deducciones", emp.deductionLines, emp.totalDeductions, "-", density);
    }

    y += isCompact ? 0.5 : 2;

    // ── Resumen Neto ──────────────────────────────────────────────────────────
    if (isCompact) {
        fill(doc, xL, y, contentW, 0.4, COLORS.orange);
        y += 1.2;
        fill(doc, xL, y, contentW, 11, COLORS.bandHead);
        rect(doc, xL, y, contentW, 11, COLORS.border, 0.2);
        renderLabel(doc, "Neto a cobrar (VES)", xL + 3, y + 7, "left", COLORS.inkMed, 7.5);
        renderMono(doc, formatVES(emp.net), xR - 3, y + 7.5, 12, true, COLORS.ink, "right");
        y += 11 + 2;
    } else {
        fill(doc, xL, y, contentW, 0.6, COLORS.orange);
        y += 2;
        fill(doc, xL, y, contentW, 16, COLORS.bandHead);
        rect(doc, xL, y, contentW, 16, COLORS.border, 0.2);
        renderLabel(doc, "Neto a cobrar (VES)", xL + 3, y + 9.5, "left", COLORS.inkMed, 9);
        renderMono(doc, formatVES(emp.net), xR - 3, y + 10.5, 16, true, COLORS.ink, "right");
        y += 16 + 6;

        // Nota legal (sólo en versión completa)
        const legal =
            "El presente recibo acredita el pago de los haberes correspondientes al período indicado, " +
            "de conformidad con la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). " +
            "Ambas partes declaran su conformidad con los montos reflejados en este documento.";

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.8);
        doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
        const legalLines = doc.splitTextToSize(legal, contentW) as string[];
        legalLines.forEach((line, i) => doc.text(line, xL, y + i * 3.5));

        y += legalLines.length * 3.5 + 6;
    }

    // ── Firmas ────────────────────────────────────────────────────────────────
    return drawSignatures(doc, xL, contentW, y, {
        compact:         isCompact,
        conformityText:  "Declaro haber recibido el pago en Bolívares (VES)",
    });
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function generatePayrollPdf(
    employees: PdfEmployeeResult[],
    opts: PdfPayrollOptions,
): Promise<void> {
    const active = employees.filter((e) => e.estado === "activo");
    if (active.length === 0) return;

    const optsWithSerial: PdfPayrollOptions = {
        ...opts,
        receiptSerial: opts.receiptSerial ?? makePayrollSerial(opts.periodStart ?? opts.payrollDate),
    };

    const [companyLogo, kontaLogo] = await Promise.all([
        opts.showLogoInPdf && opts.logoUrl
            ? loadImageAsBase64(opts.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    const pdfMode = opts.pdfMode ?? "duplicado";
    const periodLabel = (optsWithSerial.periodLabel ?? optsWithSerial.payrollDate).toUpperCase();

    const doc = pdfMode === "simple"
        ? new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
        : new jsPDF({ orientation: "portrait", unit: "mm", format: OFICIO_FORMAT });

    active.forEach((emp, i) => {
        if (i > 0) doc.addPage();

        if (pdfMode === "simple") {
            // Modo SIMPLE: A4, un recibo completo por hoja, sin badge Original/Copia.
            drawHeader(doc, {
                companyName: optsWithSerial.companyName,
                companyRif:  optsWithSerial.companyId,
                reportTitle: "Recibo de Nómina",
                periodLabel,
            });
            drawReceiptInRegion(doc, emp, optsWithSerial, 32, i, companyLogo, "full-single");
            return;
        }

        // Modo DUPLICADO: oficio con dos copias por hoja, fallback a dos hojas completas
        // si el contenido no cabe en una mitad.
        const compactHeight = estimateCompactHeight(emp, optsWithSerial, !!companyLogo);

        if (compactHeight <= HALF_HEIGHT) {
            drawReceiptInRegion(doc, emp, optsWithSerial, HALF_TOP_Y,    i, companyLogo, "compact-top");
            drawCutLine(doc, CUT_LINE_Y);
            drawReceiptInRegion(doc, emp, optsWithSerial, HALF_BOTTOM_Y, i, companyLogo, "compact-bottom");
        } else {
            drawHeader(doc, {
                companyName: optsWithSerial.companyName,
                companyRif:  optsWithSerial.companyId,
                reportTitle: "Recibo de Nómina",
                periodLabel,
            });
            drawReceiptInRegion(doc, emp, optsWithSerial, 32, i, companyLogo, "full-original");

            doc.addPage();
            drawHeader(doc, {
                companyName: optsWithSerial.companyName,
                companyRif:  optsWithSerial.companyId,
                reportTitle: "Recibo de Nómina",
                periodLabel,
            });
            drawReceiptInRegion(doc, emp, optsWithSerial, 32, i, companyLogo, "full-copy");
        }
    });

    drawFooter(doc, kontaLogo);

    doc.save(`recibos-nomina-${safeFilename(opts.companyName)}-${opts.payrollDate.replaceAll("-", "")}.pdf`);
}
