// PDF generator: Recibo de Nómina (one A4-portrait page per active employee).
//
// Renders the per-employee payroll receipt using the shared Konta chrome —
// orange-accent header, table-style sections, watermark footer. Conserves the
// per-company `pdfVisibility` flags (REQ-005) and the `salaryMode` switch.

import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";
import {
    COLORS,
    drawHeader,
    drawFooter,
    drawHeaderRow,
    drawRow,
    fill,
    hline,
    rect,
    formatVES,
    loadKontaLogo,
    renderText,
    renderMono,
    renderLabel,
    safeFilename,
} from "@/src/shared/frontend/utils/pdf-chrome";
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
}

export function makePayrollSerial(periodStart: string): string {
    const [year, month, day] = periodStart.split("-");
    const q = parseInt(day) <= 15 ? 1 : 2;
    return `NOM-${year}-${month}-Q${q}`;
}

// ── Section table ─────────────────────────────────────────────────────────────

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
): number {
    // Section title bar with right-aligned total
    fill(doc, x, y, w, 6.5, COLORS.bandHead);
    renderLabel(doc, title, x + 2, y + 4.6, "left", COLORS.inkMed, 8);
    renderMono(doc, `${sign} ${formatVES(total)}`, x + w - 2, y + 4.6, 10, true, COLORS.ink, "right");
    y += 6.5;

    if (lines.length === 0) {
        renderText(doc, "Sin conceptos", x + 2, y + 4.5, 8.5, false, COLORS.muted, "left", undefined, "helvetica");
        y += 6.5;
        return y + 3;
    }

    // Mini table header row
    const colConcept = w * 0.42;
    const colFormula = w * 0.32;
    const colAmount  = w * 0.26;
    drawHeaderRow(doc, y, 5.5, [
        { x: x,                         w: colConcept,  text: "Concepto",  align: "left"  },
        { x: x + colConcept,            w: colFormula,  text: "Cálculo",   align: "left"  },
        { x: x + colConcept + colFormula, w: colAmount, text: "Monto",     align: "right" },
    ]);
    y += 5.5;

    lines.forEach((line, i) => {
        drawRow(doc, y, 5.6, [
            { x: x,                         w: colConcept,  text: line.label,                align: "left",  size: 8.5, color: COLORS.inkMed },
            { x: x + colConcept,            w: colFormula,  text: line.formula,              align: "left",  size: 8,   mono: true, color: COLORS.muted },
            { x: x + colConcept + colFormula, w: colAmount, text: formatVES(line.amount),    align: "right", size: 9,   mono: true, bold: true, color: COLORS.ink },
        ], { zebra: i % 2 === 1 });
        y += 5.6;
    });

    return y + 3;
}

// ── Signatures block ──────────────────────────────────────────────────────────

function drawSignatures(doc: Doc, marginLeft: number, contentWidth: number, y: number): number {
    const SIG_WIDTH  = (contentWidth - 16) / 2;
    const SIG_HEIGHT = 26;

    // Employer
    const sx1 = marginLeft;
    rect(doc, sx1, y, SIG_WIDTH, SIG_HEIGHT, COLORS.borderStr, 0.3);
    hline(doc, sx1 + 8, y + SIG_HEIGHT - 9, SIG_WIDTH - 16, COLORS.borderStr, 0.3);
    renderLabel(doc, "Empleador", sx1 + SIG_WIDTH / 2, y + SIG_HEIGHT - 5, "center", COLORS.muted, 7.5);

    // Worker
    const sx2 = marginLeft + (SIG_WIDTH + 16);
    rect(doc, sx2, y, SIG_WIDTH, SIG_HEIGHT, COLORS.borderStr, 0.3);

    // Conformity checkbox + line
    const cbSize = 2.5;
    const cbX = sx2 + 4;
    const cbY = y + 4;
    rect(doc, cbX, cbY, cbSize, cbSize, COLORS.borderStr, 0.3);
    renderText(doc, "Declaro haber recibido el pago en Bolívares (VES)", cbX + cbSize + 1.5, cbY + cbSize - 0.4, 7.5, false, COLORS.muted, "left", SIG_WIDTH - cbSize - 8, "helvetica");

    hline(doc, sx2 + 8, y + SIG_HEIGHT - 9, SIG_WIDTH - 16, COLORS.borderStr, 0.3);
    renderLabel(doc, "Trabajador / Conforme", sx2 + SIG_WIDTH / 2, y + SIG_HEIGHT - 5, "center", COLORS.muted, 7.5);

    return y + SIG_HEIGHT + 6;
}

// ── Per-employee receipt ──────────────────────────────────────────────────────

function drawReceipt(
    doc: Doc,
    emp: PdfEmployeeResult,
    opts: PdfPayrollOptions,
    isFirst: boolean,
    empIdx: number,
    companyLogo: string | null,
): void {
    if (!isFirst) doc.addPage();

    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX   = 12;
    const xL        = marginX;
    const xR        = pageWidth - marginX;
    const contentW  = xR - xL;

    const periodLabel = (opts.periodLabel ?? opts.payrollDate).toUpperCase();
    const empSerial   = opts.receiptSerial
        ? `${opts.receiptSerial}-${String(empIdx + 1).padStart(4, "0")}`
        : `NOM-${empIdx + 1}`;

    // Konta header (orange accent rule + company name + report title + period)
    drawHeader(doc, {
        companyName: opts.companyName,
        companyRif:  opts.companyId,
        reportTitle: "Recibo de Nómina",
        periodLabel,
    });

    let y = 32;

    // ── Optional company logo (user-provided) above the employee identity card ─
    if (companyLogo) {
        try {
            doc.addImage(companyLogo, "JPEG", xL, y, 18, 7, undefined, "FAST");
        } catch { /* */ }
        y += 9;
    }

    // ── Identity card ─────────────────────────────────────────────────────────
    fill(doc, xL, y, contentW, 16, COLORS.rowAlt);
    rect(doc, xL, y, contentW, 16, COLORS.border, 0.2);

    const colId   = xL + 3;
    const colCed  = xL + contentW * 0.45;
    const colSal  = xR - 3;

    renderLabel(doc, "Trabajador", colId, y + 4, "left", COLORS.muted, 7);
    renderText(doc, emp.nombre.toUpperCase(), colId, y + 9, 10.5, true, COLORS.ink, "left", contentW * 0.42);
    if (emp.cargo) {
        renderText(doc, emp.cargo, colId, y + 13.5, 8, false, COLORS.muted, "left", contentW * 0.42, "helvetica");
    }

    renderLabel(doc, "Cédula", colCed, y + 4, "left", COLORS.muted, 7);
    renderMono(doc, emp.cedula, colCed, y + 9, 10.5, true, COLORS.ink, "left");
    renderMono(doc, `ID  ${empSerial}`, colCed, y + 13.5, 7.5, false, COLORS.muted, "left");

    renderLabel(doc, "Salario", colSal, y + 4, "right", COLORS.muted, 7);
    const effectiveSalaryMode = opts.pdfVisibility?.showAlicuotaBreakdown === false ? "mensual" : opts.salaryMode;
    if (effectiveSalaryMode === "integral") {
        renderMono(doc, formatVES(emp.salarioIntegral), colSal, y + 9, 10, true, COLORS.ink, "right");
        renderMono(doc, `Base: ${formatVES(emp.salarioMensual)}`, colSal, y + 13.5, 7.5, false, COLORS.muted, "right");
    } else {
        renderMono(doc, formatVES(emp.salarioMensual), colSal, y + 9, 10, true, COLORS.ink, "right");
        renderMono(doc, "Mensual", colSal, y + 13.5, 7.5, false, COLORS.muted, "right");
    }

    y += 16 + 6;

    // ── SECTIONS ──────────────────────────────────────────────────────────────
    const vis = opts.pdfVisibility;

    const filteredEarningLines = vis
        ? emp.earningLines.filter((l) => {
              const isOvertime = l.label.startsWith("H.E.");
              if (isOvertime && vis.showOvertime === false) return false;
              return true;
          })
        : emp.earningLines;

    if (!vis || vis.showEarnings !== false) {
        y = drawSection(doc, xL, y, contentW, "Asignaciones", filteredEarningLines, emp.totalEarnings, "+");
    }
    if (!vis || vis.showBonuses !== false) {
        y = drawSection(doc, xL, y, contentW, "Bonificaciones", emp.bonusLines, emp.totalBonuses, "+");
    }
    if (!vis || vis.showDeductions !== false) {
        y = drawSection(doc, xL, y, contentW, "Deducciones", emp.deductionLines, emp.totalDeductions, "-");
    }

    y += 2;

    // ── Net summary (orange-accented bar then bold value) ─────────────────────
    fill(doc, xL, y, contentW, 0.6, COLORS.orange);
    y += 2;
    fill(doc, xL, y, contentW, 16, COLORS.bandHead);
    rect(doc, xL, y, contentW, 16, COLORS.border, 0.2);

    renderLabel(doc, "Neto a cobrar (VES)", xL + 3, y + 9.5, "left", COLORS.inkMed, 9);
    renderMono(doc, formatVES(emp.net), xR - 3, y + 10.5, 16, true, COLORS.ink, "right");
    y += 16 + 6;

    // ── Legal note (sans, muted, justified-ish via splitTextToSize) ───────────
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

    // ── Signatures ────────────────────────────────────────────────────────────
    drawSignatures(doc, xL, contentW, y);
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

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    active.forEach((emp, i) => drawReceipt(doc, emp, optsWithSerial, i === 0, i, companyLogo));

    drawFooter(doc, kontaLogo);

    doc.save(`recibos-nomina-${safeFilename(opts.companyName)}-${opts.payrollDate.replaceAll("-", "")}.pdf`);
}
