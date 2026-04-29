// PDF generators: Constancia de Vacaciones — completas (Arts. 190 + 192 LOTTT)
// y fraccionadas (Art. 196). Comparten el chrome Konta con todos los demás
// reportes (header naranja, footer Kontave, paleta slate + naranja).

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
} from "@/src/shared/frontend/utils/pdf-chrome";

// ── Public types ──────────────────────────────────────────────────────────────

export interface VacPdfEmployee {
    nombre: string;
    cedula: string;
    cargo?: string;
    anios?: number;
}

export interface VacCompletasPdfData {
    companyName:      string;
    companyId?:       string;
    employee:         VacPdfEmployee;
    fechaInicio:      string;
    fechaCulminacion: string;
    fechaReintegro:   string;
    salarioVES:       number;
    salarioDia:       number;
    diasCalendario:   number;
    diasHabiles:      number;
    diasDescanso:     number;
    diasDisfrute:     number;
    diasBono:         number;
    montoDisfrute:    number;
    montoBono:        number;
    total:            number;
    logoUrl?:         string;
    showLogoInPdf?:   boolean;
}

export interface VacFraccionadasPdfData {
    companyName:       string;
    companyId?:        string;
    employee:          VacPdfEmployee;
    fechaIngreso:      string;
    fechaEgreso:       string;
    ultimoAniversario: string;
    aniosCompletos:    number;
    mesesFraccion:     number;
    diasAnuales:       number;
    salarioVES:        number;
    salarioDia:        number;
    fraccionDisfrute:  number;
    fraccionBono:      number;
    montoDisfrute:     number;
    montoBono:         number;
    total:             number;
    logoUrl?:          string;
    showLogoInPdf?:    boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type Doc = jsPDF;

function formatDateES(iso: string): string {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${parseInt(d, 10)} de ${meses[parseInt(m, 10) - 1]} de ${y}`;
}

interface ParamCol {
    label: string;
    value: string;
    accent?: boolean;
}

function drawParamsStrip(doc: Doc, x: number, w: number, y: number, cols: ParamCol[]): number {
    const H = 14;
    fill(doc, x, y, w, H, COLORS.rowAlt);
    rect(doc, x, y, w, H, COLORS.border, 0.2);
    const colW = w / cols.length;
    cols.forEach(({ label, value, accent }, i) => {
        const cx = x + i * colW;
        if (accent) fill(doc, cx, y, 1.2, H, COLORS.orange);
        renderLabel(doc, label, cx + 3, y + 5, "left", COLORS.muted, 7);
        renderMono(doc, value, cx + 3, y + 11, 9, true, COLORS.inkMed, "left");
    });
    return y + H + 4;
}

interface ConceptRow {
    label:    string;
    subtitle: string;
    dias:     number;
    monto:    number;
}

function drawConceptTable(
    doc: Doc,
    x: number,
    w: number,
    y: number,
    rows: ConceptRow[],
    totalLabel: string,
    totalDias: number,
    total: number,
): number {
    const colConcept = w * 0.6;
    const colDias    = w * 0.18;
    const colMonto   = w * 0.22;

    drawHeaderRow(doc, y, 6, [
        { x: x,                      w: colConcept, text: "Concepto", align: "left"  },
        { x: x + colConcept,         w: colDias,    text: "Días",     align: "right" },
        { x: x + colConcept + colDias, w: colMonto, text: "Monto",    align: "right" },
    ]);
    y += 6;

    rows.forEach((row, i) => {
        const H = 10;
        if (i % 2 === 1) fill(doc, x, y, w, H, COLORS.rowAlt);
        renderText(doc, row.label,    x + 3, y + 4.2, 9.5, true,  COLORS.ink,      "left", colConcept - 4, "helvetica");
        renderText(doc, row.subtitle, x + 3, y + 8.2, 7.5, false, COLORS.muted,    "left", colConcept - 4, "helvetica");
        renderMono(doc, `${row.dias} d`, x + colConcept + colDias - 2, y + 6.5, 9, false, COLORS.muted, "right");
        renderMono(doc, formatVES(row.monto), x + colConcept + colDias + colMonto - 2, y + 6.5, 10, true, COLORS.ink, "right");
        y += H;
    });

    // Orange accent + total bar
    fill(doc, x, y, w, 0.5, COLORS.orange);
    y += 1.2;
    fill(doc, x, y, w, 12, COLORS.bandHead);
    rect(doc, x, y, w, 12, COLORS.border, 0.2);
    renderLabel(doc, `${totalLabel} · ${totalDias} días`, x + 3, y + 7.8, "left", COLORS.inkMed, 9);
    renderMono(doc, formatVES(total), x + w - 3, y + 8.2, 13, true, COLORS.ink, "right");
    return y + 12 + 6;
}

function drawEmployeeCard(
    doc: Doc,
    x: number,
    w: number,
    y: number,
    employee: VacPdfEmployee,
    rightSub: string,
): number {
    const H = 16;
    fill(doc, x, y, w, H, COLORS.rowAlt);
    fill(doc, x, y, 1.5, H, COLORS.orange);
    rect(doc, x, y, w, H, COLORS.border, 0.2);
    renderLabel(doc, "Trabajador", x + 4, y + 4.5, "left", COLORS.muted, 7);
    renderText(doc, employee.nombre.toUpperCase(), x + 4, y + 9.5, 11, true, COLORS.ink, "left", w * 0.55, "helvetica");
    if (employee.cargo) {
        renderText(doc, employee.cargo, x + 4, y + 13.6, 8, false, COLORS.muted, "left", w * 0.55, "helvetica");
    }
    renderLabel(doc, "Cédula", x + w - 3, y + 4.5, "right", COLORS.muted, 7);
    renderMono(doc, employee.cedula, x + w - 3, y + 9.5, 11, true, COLORS.ink, "right");
    renderMono(doc, rightSub, x + w - 3, y + 13.6, 7.8, false, COLORS.muted, "right");
    return y + H + 5;
}

function drawSignatures(doc: Doc, x: number, w: number, y: number): number {
    renderLabel(doc, "Firmas de Conformidad", x, y + 4, "left", COLORS.inkMed, 8.5);
    y += 6;
    const boxW = (w - 14) / 2;
    const H = 24;
    ["Empleador", "Trabajador"].forEach((role, i) => {
        const sx = x + i * (boxW + 14);
        rect(doc, sx, y, boxW, H, COLORS.borderStr, 0.3);
        hline(doc, sx + 6, y + H - 8, boxW - 12, COLORS.borderStr, 0.3);
        renderLabel(doc, role, sx + boxW / 2, y + H - 4, "center", COLORS.muted, 7.5);
    });
    return y + H + 6;
}

function drawLegal(doc: Doc, x: number, w: number, y: number, text: string): number {
    hline(doc, x, y, w, COLORS.border, 0.2);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
    const lines = doc.splitTextToSize(text, w) as string[];
    lines.forEach((line, i) => doc.text(line, x, y + i * 3.5));
    return y + lines.length * 3.5 + 2;
}

// ── Vacaciones Completas ──────────────────────────────────────────────────────

export async function generateVacComplletasPdf(data: VacCompletasPdfData): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const ML = 12, W = PW - 2 * ML;

    const [companyLogo, kontaLogo] = await Promise.all([
        data.showLogoInPdf && data.logoUrl
            ? loadImageAsBase64(data.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    drawHeader(doc, {
        companyName: data.companyName,
        companyRif:  data.companyId,
        reportTitle: "Constancia de Vacaciones",
        periodLabel: `${formatDateES(data.fechaInicio)} — ${formatDateES(data.fechaCulminacion)}`,
    });

    let y = 32;

    if (companyLogo) {
        try { doc.addImage(companyLogo, "JPEG", ML, y, 18, 7, undefined, "FAST"); y += 9; } catch { /* */ }
    }

    y = drawEmployeeCard(
        doc, ML, W, y,
        data.employee,
        `${data.employee.anios ?? 0} año${(data.employee.anios ?? 0) !== 1 ? "s" : ""} de servicio`,
    );

    // Reintegro card (orange-accented strip)
    y = drawParamsStrip(doc, ML, W, y, [
        { label: "Salario Mensual", value: formatVES(data.salarioVES) },
        { label: "Salario Diario",  value: formatVES(data.salarioDia) },
        { label: "Reintegro",       value: formatDateES(data.fechaReintegro), accent: true },
        { label: "Cal · Háb · Desc", value: `${data.diasCalendario} · ${data.diasHabiles} · ${data.diasDescanso}` },
    ]);

    y = drawConceptTable(doc, ML, W, y, [
        {
            label:    "Disfrute Vacacional",
            subtitle: "Art. 190 LOTTT · 15 días base + adicionales",
            dias:     data.diasDisfrute,
            monto:    data.montoDisfrute,
        },
        {
            label:    "Bono Vacacional",
            subtitle: "Art. 192 LOTTT · 15 días base + adicionales",
            dias:     data.diasBono,
            monto:    data.montoBono,
        },
    ], "Total a recibir", data.diasDisfrute + data.diasBono, data.total);

    y = drawSignatures(doc, ML, W, y);

    drawLegal(doc, ML, W, y,
        "La presente constancia certifica el disfrute del período vacacional de conformidad con los Arts. 190 y 192 " +
        "de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). " +
        "Las firmas de ambas partes confirman el acuerdo sobre las fechas y montos indicados.",
    );

    drawFooter(doc, kontaLogo);

    doc.save(`vacaciones-completas-${safeFilename(data.employee.cedula)}-${data.fechaInicio.replaceAll("-", "")}.pdf`);
}

// ── Vacaciones Fraccionadas ───────────────────────────────────────────────────

export async function generateVacFraccionadasPdf(data: VacFraccionadasPdfData): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const ML = 12, W = PW - 2 * ML;

    const [companyLogo, kontaLogo] = await Promise.all([
        data.showLogoInPdf && data.logoUrl
            ? loadImageAsBase64(data.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    drawHeader(doc, {
        companyName: data.companyName,
        companyRif:  data.companyId,
        reportTitle: "Vacaciones Fraccionadas",
        periodLabel: `Egreso ${formatDateES(data.fechaEgreso)}`,
    });

    let y = 32;

    if (companyLogo) {
        try { doc.addImage(companyLogo, "JPEG", ML, y, 18, 7, undefined, "FAST"); y += 9; } catch { /* */ }
    }

    y = drawEmployeeCard(
        doc, ML, W, y,
        data.employee,
        `${data.aniosCompletos} año${data.aniosCompletos !== 1 ? "s" : ""} completo${data.aniosCompletos !== 1 ? "s" : ""}`,
    );

    y = drawParamsStrip(doc, ML, W, y, [
        { label: "Fecha de Ingreso",   value: formatDateES(data.fechaIngreso) },
        { label: "Último Aniversario", value: formatDateES(data.ultimoAniversario) },
        { label: "Meses Año Curso",    value: `${data.mesesFraccion} mes${data.mesesFraccion !== 1 ? "es" : ""}`, accent: true },
        { label: "Días Anuales Base",  value: `${data.diasAnuales} días` },
    ]);

    // Formula box
    const formulaH = 11;
    fill(doc, ML, y, W, formulaH, COLORS.rowAlt);
    rect(doc, ML, y, W, formulaH, COLORS.border, 0.2);
    renderLabel(doc, "Fórmula Art. 196 LOTTT", ML + 3, y + 4.5, "left", COLORS.muted, 7);
    renderMono(doc,
        `(${data.diasAnuales} días / 12 meses) × ${data.mesesFraccion} meses = ${data.fraccionDisfrute} días`,
        ML + 3, y + 9, 9.5, true, COLORS.inkMed, "left",
    );
    y += formulaH + 5;

    y = drawConceptTable(doc, ML, W, y, [
        {
            label:    "Disfrute Fraccionado",
            subtitle: `Art. 190 + 196 LOTTT · ${data.diasAnuales}d/12 × ${data.mesesFraccion} meses`,
            dias:     data.fraccionDisfrute,
            monto:    data.montoDisfrute,
        },
        {
            label:    "Bono Vacacional Fraccionado",
            subtitle: `Art. 192 + 196 LOTTT · ${data.diasAnuales}d/12 × ${data.mesesFraccion} meses`,
            dias:     data.fraccionBono,
            monto:    data.montoBono,
        },
    ], "Total Fraccionado", data.fraccionDisfrute + data.fraccionBono, data.total);

    // Salary recap
    fill(doc, ML, y, W, 12, COLORS.rowAlt);
    rect(doc, ML, y, W, 12, COLORS.border, 0.2);
    renderLabel(doc, "Salario Mensual",  ML + 3,           y + 4.5, "left", COLORS.muted, 7);
    renderMono(doc,  formatVES(data.salarioVES), ML + 3,           y + 9.5, 9.5, true, COLORS.inkMed, "left");
    renderLabel(doc, "Salario Diario",   ML + W * 0.5,     y + 4.5, "left", COLORS.muted, 7);
    renderMono(doc,  formatVES(data.salarioDia), ML + W * 0.5,     y + 9.5, 9.5, true, COLORS.inkMed, "left");
    y += 12 + 6;

    y = drawSignatures(doc, ML, W, y);

    drawLegal(doc, ML, W, y,
        "La presente constancia certifica el pago de las vacaciones fraccionadas de conformidad con el Art. 196 " +
        "de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT), correspondientes a la fracción " +
        "del año de servicio no cubierta por el período completo. El cálculo se realiza sobre el salario normal del trabajador.",
    );

    drawFooter(doc, kontaLogo);

    doc.save(`vacaciones-fraccionadas-${safeFilename(data.employee.cedula)}-${data.fechaEgreso.replaceAll("-", "")}.pdf`);
}
