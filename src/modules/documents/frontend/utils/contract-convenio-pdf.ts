import type jsPDF from "jspdf";
import {
    COLORS,
    pageBounds,
    drawFooter,
    hline,
    renderText,
    renderLabel,
    renderMono,
    loadKontaLogo,
    safeFilename,
    formatN,
    type RGB,
} from "@/src/shared/frontend/utils/pdf-chrome";
import { renderRichParagraph, type RichSegment } from "@/src/shared/frontend/utils/pdf-rich-text";
import { loadImageAsBase64 } from "@/src/modules/payroll/frontend/utils/pdf-image-helper";

export interface ConvenioData {
    companyName: string;
    companyRif: string;
    companyCity: string;
    companyRegistro: string;
    companyAddress: string;
    logoUrl?: string;
    showLogo?: boolean;

    repName: string;
    repCedula: string;
    repCargo: string;
    repNationality: string;

    empName: string;
    empCedula: string;
    empNationality: string;

    montoUsd: number;
    fechaInicio: string;
    ciudadFirma: string;
    fechaDocumento: string;

    lawyerName?: string;
    lawyerInpreabogado?: string;
}

type Doc = jsPDF;

const MARGIN_X = 20;
const MARGIN_TOP = 15;
const BODY_FONT = 10;
const LINE_H = 4.8;
const CLAUSE_GAP = 3;
const INDENT_SUB = 10;

const MONTHS_LONG = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function fmtDateLong(iso: string): string {
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    const month = MONTHS_LONG[parseInt(m, 10) - 1] ?? m;
    return `${parseInt(d, 10)}° de ${month} de ${y}`;
}

function fmtDay(iso: string): string {
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    const month = MONTHS_LONG[parseInt(m, 10) - 1] ?? m;
    return `${parseInt(d, 10)} (${ordinal(parseInt(d, 10))}) día de ${month} de ${y}`;
}

function ordinal(n: number): string {
    if (n === 1) return "1er";
    return `${n}`;
}

function bold(text: string): RichSegment { return { text, bold: true }; }
function normal(text: string): RichSegment { return { text }; }

function drawDocumentForEmployee(
    doc: Doc,
    data: ConvenioData,
    companyLogo: string | null,
): void {
    const pw = doc.internal.pageSize.getWidth();
    const xL = MARGIN_X;
    const xR = pw - MARGIN_X;
    const contentW = xR - xL;
    const color: RGB = COLORS.ink;

    let y = MARGIN_TOP;

    // ── Header: Logo + lawyer info + RIF ─────────────────────────
    if (companyLogo) {
        try {
            doc.addImage(companyLogo, "JPEG", xL, y, 22, 14, undefined, "FAST");
        } catch { /* ignore */ }
    }

    if (data.lawyerName) {
        renderText(doc, data.lawyerName, xR, y + 4, 8, false, COLORS.muted, "right", contentW * 0.4);
        if (data.lawyerInpreabogado) {
            renderLabel(doc, "ABOGADO", xR, y + 8, "right", COLORS.muted, 7);
            renderText(
                doc, `INPREABOGADO N° ${data.lawyerInpreabogado}`,
                xR, y + 12, 7.5, false, COLORS.muted, "right",
            );
        }
    }

    renderMono(doc, `RIF: ${data.companyRif}`, xL, y + 18, 8, false, COLORS.muted, "left");

    y += 24;

    // ── Title ────────────────────────────────────────────────────
    const titleLine1 = "CONVENIO DE BENEFICIO SOCIO ECONÓMICO";
    const titleLine2 = "COMPLEMENTARIO PARA EL TRABAJADOR";

    renderText(doc, titleLine1, pw / 2, y, 11, true, color, "center");
    y += 5;
    renderText(doc, titleLine2, pw / 2, y, 11, true, color, "center");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const w1 = (doc.getStringUnitWidth(titleLine1) * 11) / doc.internal.scaleFactor;
    const w2 = (doc.getStringUnitWidth(titleLine2) * 11) / doc.internal.scaleFactor;
    hline(doc, (pw - w1) / 2, y - 4.2, w1, COLORS.ink, 0.3);
    hline(doc, (pw - w2) / 2, y + 0.8, w2, COLORS.ink, 0.3);

    y += 8;

    // ── Opening paragraph ────────────────────────────────────────
    const cedPrefix = (ced: string): string => {
        const c = ced.trim().toUpperCase();
        if (c.startsWith("V") || c.startsWith("E")) return `N° ${c}`;
        return `N° V- ${c}`;
    };

    const openingSegments: RichSegment[] = [
        normal("Entre la Sociedad Mercantil"),
        bold(` ${data.companyName},`),
        normal(` domiciliada en ${data.companyCity} e inscrita en el ${data.companyRegistro}, representada para este Acto por su ${data.repCargo},`),
        bold(` ${data.repName.toUpperCase()},`),
        normal(` mayor de edad, de nacionalidad ${data.repNationality}, titular de la cédula de identidad`),
        bold(` ${cedPrefix(data.repCedula)},`),
        normal(" quien en lo sucesivo se denominará EMPRESA, y"),
        bold(` ${data.empName.toUpperCase()},`),
        normal(` mayor de edad, de nacionalidad ${data.empNationality}, titular de la cédula de identidad`),
        bold(` ${cedPrefix(data.empCedula)},`),
        normal(" quien en lo adelante se denominará TRABAJADOR, se celebra el presente acuerdo sometido a las siguientes estipulaciones:"),
    ];

    y = renderRichParagraph(doc, openingSegments, xL, y, contentW, BODY_FONT, LINE_H, color);
    y += CLAUSE_GAP;

    // ── Helper: check page break before clause ───────────────────
    const bounds = pageBounds(doc);
    const checkBreak = (neededMm: number) => {
        if (y + neededMm > bounds.contentBot) {
            doc.addPage();
            y = MARGIN_TOP + 5;
        }
    };

    // ── PRIMERA ──────────────────────────────────────────────────
    checkBreak(20);
    y = renderRichParagraph(doc, [
        bold("PRIMERA:"),
        normal(" El objeto del acuerdo es implementar un beneficio social de carácter no remunerativo, conforme a lo establecido en el artículo 105, de la Ley Orgánica del Trabajo, de los Trabajadores, complementario."),
    ], xL, y, contentW, BODY_FONT, LINE_H, color);
    y += CLAUSE_GAP;

    // ── SEGUNDA ──────────────────────────────────────────────────
    checkBreak(20);
    y = renderRichParagraph(doc, [
        bold("SEGUNDA:"),
        normal(" El monto del presente bono será de"),
        bold(` USD ${formatN(data.montoUsd)}$,`),
        normal(" el cual será cancelado mensualmente, en base a la tasa del tipo de cambio oficial publicada por el BCV, vigente para el día del pago."),
    ], xL, y, contentW, BODY_FONT, LINE_H, color);
    y += CLAUSE_GAP;

    // ── TERCERA ──────────────────────────────────────────────────
    checkBreak(20);
    y = renderRichParagraph(doc, [
        bold("TERCERA:"),
        normal(" El mencionado beneficio no reviste carácter salarial y constituye una liberación de la Empresa, por lo que podrá ser modificado o eliminado cuando ésta lo disponga."),
    ], xL, y, contentW, BODY_FONT, LINE_H, color);
    y += CLAUSE_GAP;

    // ── CUARTA ───────────────────────────────────────────────────
    checkBreak(45);
    y = renderRichParagraph(doc, [
        bold("CUARTA:"),
        normal(" EL (LA) TRABAJADOR (A) será desincorporado del presente beneficio, siempre y cuando se presenten los siguientes supuestos:"),
    ], xL, y, contentW, BODY_FONT, LINE_H, color);
    y += 2;

    const subItems = [
        "a. En caso de violación a cualquiera de las disposiciones contenidas en el presente convenio personal.",
        "b. En caso de desincorporación de EL (LA) TRABAJADOR (A) a la ENTIDAD DE TRABAJO, bien por renuncia o despido.",
        "c. Por cualquier causa que la ENTIDAD DE TRABAJO así lo crea conveniente a sus fines, ya que el presente servicio, no es de ningún modo un beneficio adquirido.",
    ];
    for (const item of subItems) {
        y = renderRichParagraph(doc, [normal(item)], xL + INDENT_SUB, y, contentW - INDENT_SUB, BODY_FONT, LINE_H, color);
        y += 1.5;
    }
    y += CLAUSE_GAP - 1.5;

    // ── QUINTA ────────────────────────────────────────────────────
    checkBreak(35);
    y = renderRichParagraph(doc, [
        bold("QUINTA:"),
        normal(` El presente convenio, entrará en vigor a partir del día ${fmtDateLong(data.fechaInicio)}. La duración del presente beneficio será indefinida mientras`),
        bold(" EL (LA) TRABAJADOR (A)"),
        normal(" preste sus servicios a la"),
        bold(" ENTIDAD DE TRABAJO,"),
        normal(" no obstante,"),
        bold(" EL (LA) TRABAJADOR (A)"),
        normal(" acepta que la"),
        bold(" ENTIDAD DE TRABAJO"),
        normal(" podrá en cualquier momento decidir eliminarlo o realizar cambios para el otorgamiento de dicho beneficio, tales como, formas de hacerlo efectivo, cuantía, frecuencia, cambio de proveedor, entre otros."),
    ], xL, y, contentW, BODY_FONT, LINE_H, color);
    y += CLAUSE_GAP;

    // ── SEXTA ────────────────────────────────────────────────────
    checkBreak(20);
    y = renderRichParagraph(doc, [
        bold("SEXTA:"),
        normal(` Se hace un (1) ejemplar de un mismo tenor y a un solo efecto, en la Ciudad de ${data.ciudadFirma} al ${fmtDay(data.fechaDocumento)}.`),
    ], xL, y, contentW, BODY_FONT, LINE_H, color);
    y += 12;

    // ── Signatures ───────────────────────────────────────────────
    checkBreak(30);

    const sigW = (contentW - 20) / 2;
    const sx1 = xL;
    const sx2 = xR - sigW;

    hline(doc, sx1 + 10, y, sigW - 20, COLORS.borderStr, 0.3);
    hline(doc, sx2 + 10, y, sigW - 20, COLORS.borderStr, 0.3);
    y += 4;
    renderLabel(doc, "Por la Empresa", sx1 + sigW / 2, y, "center", COLORS.muted, 7.5);
    renderLabel(doc, "El Trabajador", sx2 + sigW / 2, y, "center", COLORS.muted, 7.5);
    y += 10;

    // ── Company address footer ───────────────────────────────────
    if (data.companyAddress) {
        hline(doc, xL, y, contentW, COLORS.border, 0.2);
        y += 4;
        renderText(doc, data.companyAddress, pw / 2, y, 7.5, false, COLORS.muted, "center", contentW);
    }
}

export async function generateConvenioPdf(employees: ConvenioData[]): Promise<void> {
    if (employees.length === 0) return;

    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const first = employees[0]!;
    const [companyLogo, kontaLogo] = await Promise.all([
        first.showLogo && first.logoUrl
            ? loadImageAsBase64(first.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    employees.forEach((data, i) => {
        if (i > 0) doc.addPage();
        drawDocumentForEmployee(doc, data, companyLogo);
    });

    drawFooter(doc, kontaLogo);

    const datePart = first.fechaDocumento.replaceAll("-", "");
    doc.save(`convenio-beneficio-${safeFilename(first.companyName)}-${datePart}.pdf`);
}
