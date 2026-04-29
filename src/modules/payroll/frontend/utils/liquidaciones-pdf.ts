// PDF generator: Constancia de Liquidación (renuncia / despido). Una página por
// empleado, con tabla de conceptos y firma. Estilo Konta — header naranja,
// footer Kontave compartido en cada página.

import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";
import {
    COLORS,
    drawHeader,
    drawFooter,
    drawHeaderRow,
    fill,
    hline,
    rect,
    formatVES,
    loadKontaLogo,
    renderText,
    renderMono,
    renderLabel,
    safeFilename,
    fmtDateEs,
} from "@/src/shared/frontend/utils/pdf-chrome";

// ── Public types ──────────────────────────────────────────────────────────────

export interface LiquidationLine {
    label:      string;
    days?:      number;
    formula?:   string;
    salary?:    number;
    amount:     number;
    highlight?: "amber";
}

export interface LiquidationEmployee {
    name:            string;
    idNumber:        string;
    role:            string;
    hireDate:        string;
    terminationDate: string;
    yearsOfService:  number;
    daysOfService:   number;
    reason:          "renuncia" | "despido_justificado" | "despido_injustificado";
    lines:           LiquidationLine[];
    total:           number;
}

export interface LiquidationOptions {
    companyName:    string;
    companyId?:     string;
    documentDate:   string;
    bcvRate?:       number;
    logoUrl?:       string;
    showLogoInPdf?: boolean;
}

const REASON_LABELS: Record<LiquidationEmployee["reason"], string> = {
    renuncia:              "Renuncia voluntaria",
    despido_justificado:   "Despido justificado",
    despido_injustificado: "Despido injustificado",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type Doc = jsPDF;

function drawIdentityCard(doc: Doc, x: number, w: number, y: number, emp: LiquidationEmployee, dailySalary: number): number {
    const H = 18;
    fill(doc, x, y, w, H, COLORS.rowAlt);
    fill(doc, x, y, 1.5, H, COLORS.orange);
    rect(doc, x, y, w, H, COLORS.border, 0.2);

    const c1 = x + 4;
    const c2 = x + w * 0.4;
    const c3 = x + w - 3;

    renderLabel(doc, "Trabajador", c1, y + 4, "left", COLORS.muted, 7);
    renderText(doc, emp.name.toUpperCase(), c1, y + 9, 10.5, true, COLORS.ink, "left", c2 - c1 - 4, "helvetica");
    if (emp.role) renderText(doc, emp.role, c1, y + 13.5, 7.8, false, COLORS.muted, "left", c2 - c1 - 4, "helvetica");
    renderMono(doc, "CI " + emp.idNumber, c1, y + 16.8, 7.8, false, COLORS.inkMed, "left");

    renderLabel(doc, "Antigüedad", c2, y + 4, "left", COLORS.muted, 7);
    renderMono(doc, `${emp.yearsOfService}a ${emp.daysOfService % 365}d`, c2, y + 9, 10, true, COLORS.ink, "left");
    renderMono(doc, `Ingreso ${fmtDateEs(emp.hireDate)}`, c2, y + 13.5, 7.8, false, COLORS.muted, "left");
    renderMono(doc, `Egreso ${fmtDateEs(emp.terminationDate)}`, c2, y + 16.8, 7.8, false, COLORS.muted, "left");

    renderLabel(doc, "Salario Base / Día", c3, y + 4, "right", COLORS.muted, 7);
    renderMono(doc, dailySalary > 0 ? formatVES(dailySalary) : "—", c3, y + 9, 10, true, COLORS.ink, "right");

    return y + H + 5;
}

// ── Per-employee receipt ──────────────────────────────────────────────────────

function drawReceipt(doc: Doc, emp: LiquidationEmployee, opts: LiquidationOptions, isFirst: boolean, _logoBase64: string | null): void {
    if (!isFirst) doc.addPage();

    const PW = doc.internal.pageSize.getWidth();
    const ML = 12, W = PW - 2 * ML;

    drawHeader(doc, {
        companyName: opts.companyName,
        companyRif:  opts.companyId,
        reportTitle: "Constancia de Liquidación",
        periodLabel: REASON_LABELS[emp.reason] ?? emp.reason,
    });

    let y = 32;

    if (_logoBase64) {
        try { doc.addImage(_logoBase64, "JPEG", ML, y, 18, 7, undefined, "FAST"); y += 9; } catch { /* */ }
    }

    const dailySalary = emp.lines.length > 0 && emp.lines[0].salary && emp.lines[0].salary > 0
        ? emp.lines[0].salary
        : (emp.total > 0 ? emp.total / 30 : 0);

    y = drawIdentityCard(doc, ML, W, y, emp, dailySalary);

    // ── Concept table ─────────────────────────────────────────────────────────
    const colConcept = W * 0.62;
    const colDias    = W * 0.12;
    const colMonto   = W * 0.26;
    drawHeaderRow(doc, y, 6, [
        { x: ML,                          w: colConcept, text: "Concepto / Cálculo", align: "left"  },
        { x: ML + colConcept,             w: colDias,    text: "Días",               align: "center"},
        { x: ML + colConcept + colDias,   w: colMonto,   text: "Monto",              align: "right" },
    ]);
    y += 6;

    emp.lines.forEach((line, i) => {
        const H = line.formula ? 10 : 7;
        if (i % 2 === 1) fill(doc, ML, y, W, H, COLORS.rowAlt);
        renderText(doc, line.label, ML + 3, y + 4.2, 9.5, true, COLORS.ink, "left", colConcept - 4, "helvetica");
        if (line.formula) {
            renderMono(doc, line.formula, ML + 3, y + 8, 7.8, false, COLORS.muted, "left");
        }
        if (line.days !== undefined) {
            renderMono(doc, String(line.days), ML + colConcept + colDias / 2, y + (line.formula ? 6 : 4.5), 9, false, COLORS.muted, "center");
        }
        renderMono(doc, formatVES(line.amount), ML + colConcept + colDias + colMonto - 2, y + (line.formula ? 6 : 4.5), 9.5, true, COLORS.ink, "right");
        y += H;
        hline(doc, ML, y, W, COLORS.border, 0.2);
    });

    y += 4;

    // ── Total bar (orange-accented) ───────────────────────────────────────────
    fill(doc, ML, y, W, 0.6, COLORS.orange);
    y += 1.4;
    fill(doc, ML, y, W, 14, COLORS.bandHead);
    rect(doc, ML, y, W, 14, COLORS.border, 0.2);
    renderLabel(doc, "Líquido a recibir", ML + 3, y + 8.5, "left", COLORS.inkMed, 9);
    renderMono(doc, formatVES(emp.total), ML + W - 3, y + 9, 14, true, COLORS.ink, "right");
    y += 14 + 6;

    // ── Legal ─────────────────────────────────────────────────────────────────
    const legal =
        "El presente documento certifica la liquidación y pago de todas las acreencias laborales aplicables al trabajador indicado, " +
        "calculadas conforme a la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). Incluye prestaciones sociales, " +
        "utilidades, vacaciones y afines" +
        (emp.reason === "despido_injustificado" ? " e indemnización por despido injustificado (Art. 92)." : ".");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    const lines = doc.splitTextToSize(legal, W) as string[];
    lines.forEach((ln, i) => doc.text(ln, ML, y + i * 3.5));
    y += lines.length * 3.5 + 8;

    // ── Signatures ────────────────────────────────────────────────────────────
    const SIG_W = (W - 16) / 2;
    const SIG_H = 24;
    rect(doc, ML, y, SIG_W, SIG_H, COLORS.borderStr, 0.3);
    hline(doc, ML + 8, y + SIG_H - 8, SIG_W - 16, COLORS.borderStr, 0.3);
    renderLabel(doc, "Representante del empleador", ML + SIG_W / 2, y + SIG_H - 4, "center", COLORS.muted, 7.5);

    rect(doc, ML + SIG_W + 16, y, SIG_W, SIG_H, COLORS.borderStr, 0.3);
    hline(doc, ML + SIG_W + 16 + 8, y + SIG_H - 8, SIG_W - 16, COLORS.borderStr, 0.3);
    renderLabel(doc, `Trabajador · CI ${emp.idNumber}`, ML + SIG_W + 16 + SIG_W / 2, y + SIG_H - 4, "center", COLORS.muted, 7.5);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function generateLiquidationPdf(employees: LiquidationEmployee[], opts: LiquidationOptions): Promise<void> {
    if (employees.length === 0) return;

    const [companyLogo, kontaLogo] = await Promise.all([
        opts.showLogoInPdf && opts.logoUrl
            ? loadImageAsBase64(opts.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    employees.forEach((emp, i) => drawReceipt(doc, emp, opts, i === 0, companyLogo));

    drawFooter(doc, kontaLogo);

    doc.save(`liquidaciones-${safeFilename(opts.companyName)}-${opts.documentDate.replaceAll("-", "")}.pdf`);
}
