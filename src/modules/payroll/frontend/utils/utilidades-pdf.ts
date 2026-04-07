import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";

export interface UtilPdfEmployee {
    nombre: string;
    cedula: string;
    cargo?: string;
}

export interface UtilidadesCompletasPdfData {
    companyName:    string;
    employee:       UtilPdfEmployee;
    anioFiscal:     number;
    salarioVES:     number;
    salarioDia:     number;
    diasUtilidades: number;
    monto:          number;
    logoUrl?:       string;
    showLogoInPdf?: boolean;
}

export interface UtilidadesFraccionadasPdfData {
    companyName:      string;
    employee:         UtilPdfEmployee;
    anioFiscal:       number;
    fechaIngreso:     string;   // ISO
    fechaCorte:       string;   // ISO
    inicioFiscal:     string;   // ISO
    periodoInicio:    string;   // ISO
    mesesTrabajados:  number;
    diasUtilidades:   number;
    diasFraccionados: number;
    salarioVES:       number;
    salarioDia:       number;
    monto:            number;
    logoUrl?:         string;
    showLogoInPdf?:   boolean;
}

type RGB = [number, number, number];
const C = {
    ink:       [32,  32,  40]  as RGB,
    inkMed:    [70,  70,  80]  as RGB,
    muted:     [140, 140, 150] as RGB,
    border:    [230, 230, 235] as RGB,
    borderStr: [190, 190, 200] as RGB,
    bg:        [255, 255, 255] as RGB,
    rowAlt:    [248, 248, 252] as RGB,
    white:     [255, 255, 255] as RGB,
};

type Doc = jsPDF;

const fill = (doc: Doc, x: number, y: number, w: number, h: number, c: RGB) => {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(x, y, w, h, "F");
};

const hline = (doc: Doc, x: number, y: number, w: number, c: RGB = C.border, lw = 0.25) => {
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.line(x, y, x + w, y);
};

const t = (doc: Doc, text: string, x: number, y: number, size: number, bold: boolean, color: RGB, align: "left" | "center" | "right" = "left", maxW?: number, font: "helvetica" | "courier" = "helvetica") => {
    doc.setFont(font, bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const opts: Record<string, unknown> = { align };
    if (maxW) opts.maxWidth = maxW;
    doc.text(text, x, y, opts);
};

const lbl = (doc: Doc, text: string, x: number, y: number, align: "left" | "right" | "center" = "left", color: RGB = C.muted) =>
    t(doc, text.toUpperCase(), x, y, 6, true, color, align, undefined, "helvetica");

const tm = (doc: Doc, text: string, x: number, y: number, size: number, bold: boolean, c: RGB, align: "left" | "right" | "center" = "left") => 
    t(doc, text, x, y, size, bold, c, align, undefined, "courier");

const fmtVES = (n: number) => "Bs. " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`.toUpperCase();
};

function drawFooter(doc: Doc, PW: number, PH: number, companyName: string, sub: string) {
    fill(doc, 0, PH - 14, PW, 14, C.white);
    hline(doc, 0, PH - 14, PW, C.border, 0.4);
    lbl(doc, `${companyName.toUpperCase()}  |  ${sub}  |  DOCUMENTO CONFIDENCIAL`, PW / 2, PH - 7, "center", C.muted);
}

function drawSignatures(doc: Doc, ML: number, W: number, y: number): number {
    const SIG_W = (W - 16) / 2;
    const SIG_H = 24;
    ["EMPLEADOR", "TRABAJADOR"].forEach((role, i) => {
        const sx = ML + i * (SIG_W + 16);
        doc.setDrawColor(C.borderStr[0], C.borderStr[1], C.borderStr[2]);
        doc.setLineWidth(0.4);
        doc.setLineDashPattern([2, 1.5], 0);
        doc.rect(sx, y, SIG_W, SIG_H, "S");
        doc.setLineDashPattern([], 0); // reset
        
        hline(doc, sx + 8, y + SIG_H - 8, SIG_W - 16, C.borderStr, 0.4);
        lbl(doc, role, sx + SIG_W / 2, y + SIG_H - 4.5, "center", C.muted);
    });
    return y + SIG_H + 8;
}

export async function generateUtilidadesCompletasPdf(data: UtilidadesCompletasPdfData): Promise<void> {
    console.log("Starting generateUtilidadesCompletasPdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 16, MR = PW - 16, W = MR - ML;

    let logoBase64 = null;
    if (data.showLogoInPdf && data.logoUrl) {
        logoBase64 = await loadImageAsBase64(data.logoUrl).catch(err => {
            console.warn("Logo fetch failed", err);
            return null;
        });
    }

    fill(doc, 0, 0, PW, PH, C.bg);

    const topY = 20;
    if (logoBase64) {
        try { doc.addImage(logoBase64, "JPEG", ML, topY - 5, 28, 11); } catch { /* */ }
    }
    
    t(doc, data.companyName.toUpperCase(), ML + 32, topY, 13, true, C.ink);
    t(doc, "CONSTANCIA DE UTILIDADES ANUALES", ML + 32, topY + 5.5, 7, false, C.muted);

    lbl(doc, "AÑO FISCAL", MR, topY, "right");
    tm(doc, String(data.anioFiscal), MR, topY + 6, 12, true, C.ink, "right");

    let y = 38;
    hline(doc, ML, y, W, C.borderStr, 0.5);
    y += 12;

    const c1x = ML;
    const c2x = ML + W * 0.40;
    const c3x = ML + W * 0.70;

    lbl(doc, "Trabajador", c1x, y);
    t(doc, data.employee.nombre.toUpperCase(), c1x, y + 5, 9, true, C.ink, "left", c2x - c1x - 4);
    if (data.employee.cargo) t(doc, data.employee.cargo.toUpperCase(), c1x, y + 9, 6.5, false, C.muted);

    lbl(doc, "Cédula", c2x, y);
    tm(doc, data.employee.cedula, c2x, y + 5, 9, true, C.ink, "left");

    lbl(doc, "Sal. Mensual", c3x, y);
    tm(doc, fmtVES(data.salarioVES), c3x, y + 5, 8.5, true, C.ink, "left");
    tm(doc, `Diario: ${fmtVES(data.salarioDia)}`, c3x, y + 9.5, 6.5, false, C.muted, "left");

    y += 18;
    
    fill(doc, ML, y, W, 8, C.rowAlt);
    t(doc, "DÍAS DE UTILIDADES BASE (Art. 131)", ML + 4, y + 5.5, 7, true, C.ink);
    tm(doc, `${data.diasUtilidades} DÍAS`, MR - 4, y + 5.5, 9, true, C.ink, "right");
    y += 8;
    hline(doc, ML, y, W, C.borderStr, 0.8);
    y += 8;

    lbl(doc, "Fórmula", ML, y);
    tm(doc, `${data.diasUtilidades} días × ${fmtVES(data.salarioDia)} / día  =  ${fmtVES(data.monto)}`, ML, y + 6, 8, true, C.inkMed, "left");

    y += 14;

    fill(doc, ML, y, W, 12, C.rowAlt);
    t(doc, "MONTO A PAGAR (UTILIDADES NETAS)", ML + 4, y + 7.5, 8, true, C.ink);
    tm(doc, fmtVES(data.monto), MR - 4, y + 8, 12, true, C.ink, "right");
    y += 12;
    hline(doc, ML, y, W, C.borderStr, 0.8);
    y += 8;

    const legal = `La presente constancia certifica el pago de utilidades correspondientes al año fiscal ${data.anioFiscal}, de conformidad con los Arts. 131 y 174 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). El cálculo se realiza sobre el salario normal del trabajador. La firma de ambas partes confirma la recepción de dicho beneficio.`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    (doc.splitTextToSize(legal, W) as string[]).forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 4);
    });

    y += 24;
    y = drawSignatures(doc, ML, W, y);

    drawFooter(doc, PW, PH, data.companyName, `UTILIDADES ${data.anioFiscal}`);
    console.log("Saving PDF...");
    doc.save(`utilidades_${data.employee.cedula}_${data.anioFiscal}.pdf`);
}

export async function generateUtilidadesFraccionadasPdf(data: UtilidadesFraccionadasPdfData): Promise<void> {
    console.log("Starting generateUtilidadesFraccionadasPdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 16, MR = PW - 16, W = MR - ML;

    let logoBase64 = null;
    if (data.showLogoInPdf && data.logoUrl) {
        logoBase64 = await loadImageAsBase64(data.logoUrl).catch(err => {
            console.warn("Logo fetch failed", err);
            return null;
        });
    }

    fill(doc, 0, 0, PW, PH, C.bg);

    const topY = 20;
    if (logoBase64) {
        try { doc.addImage(logoBase64, "JPEG", ML, topY - 5, 28, 11); } catch { /* */ }
    }
    
    t(doc, data.companyName.toUpperCase(), ML + 32, topY, 13, true, C.ink);
    t(doc, "CONSTANCIA DE UTILIDADES FRACCIONADAS", ML + 32, topY + 5.5, 7, false, C.muted);

    lbl(doc, "AÑO FISCAL", MR, topY, "right");
    tm(doc, String(data.anioFiscal), MR, topY + 6, 12, true, C.ink, "right");

    let y = 38;
    hline(doc, ML, y, W, C.borderStr, 0.5);
    y += 12;

    const c1x = ML;
    const c2x = ML + W * 0.45;
    const c3x = ML + W * 0.70;

    lbl(doc, "Trabajador", c1x, y);
    t(doc, data.employee.nombre.toUpperCase(), c1x, y + 5, 9, true, C.ink, "left", c2x - c1x - 4);
    if (data.employee.cargo) t(doc, data.employee.cargo.toUpperCase(), c1x, y + 9, 6.5, false, C.muted);

    lbl(doc, "Cédula", c2x, y);
    tm(doc, data.employee.cedula, c2x, y + 5, 9, true, C.ink, "left");

    lbl(doc, "Meses Trabajados", c3x, y);
    tm(doc, `${data.mesesTrabajados} MES${data.mesesTrabajados !== 1 ? "ES" : ""}`, c3x, y + 5, 8.5, true, C.ink, "left");
    tm(doc, `Período: ${fmtDate(data.periodoInicio)} al ${fmtDate(data.fechaCorte)}`, c3x, y + 9.5, 5.5, false, C.muted, "left");

    y += 18;
    
    fill(doc, ML, y, W, 8, C.rowAlt);
    t(doc, "DÍAS FRACCIONADOS (Art. 175)", ML + 4, y + 5.5, 7, true, C.ink);
    tm(doc, `${data.diasFraccionados} DÍAS`, MR - 4, y + 5.5, 9, true, C.ink, "right");
    y += 8;
    hline(doc, ML, y, W, C.borderStr, 0.8);
    y += 8;

    lbl(doc, "Fórmula", ML, y);
    tm(doc, `⌈ ${data.diasUtilidades} d / 12 m × ${data.mesesTrabajados} meses ⌉ = ${data.diasFraccionados} d`, ML, y + 6, 7, true, C.inkMed, "left");
    tm(doc, `${data.diasFraccionados} días × ${fmtVES(data.salarioDia)} / día  =  ${fmtVES(data.monto)}`, ML, y + 12, 8, true, C.inkMed, "left");

    y += 20;

    fill(doc, ML, y, W, 12, C.rowAlt);
    t(doc, "MONTO FRACCIONADO", ML + 4, y + 7.5, 8, true, C.ink);
    tm(doc, fmtVES(data.monto), MR - 4, y + 8, 12, true, C.ink, "right");
    y += 12;
    hline(doc, ML, y, W, C.borderStr, 0.8);
    y += 8;

    const legal = `La presente constancia certifica el pago de utilidades fraccionadas correspondientes al período trabajado en el año fiscal ${data.anioFiscal}, de conformidad con el Art. 175 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT). El cálculo es proporcional a los meses completos laborados desde el inicio del año fiscal o de la relación laboral (lo que ocurra después).`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    (doc.splitTextToSize(legal, W) as string[]).forEach((line: string, i: number) => {
        doc.text(line, ML, y + i * 4);
    });

    y += 24;
    y = drawSignatures(doc, ML, W, y);

    drawFooter(doc, PW, PH, data.companyName, `UTILIDADES FRACCIONADAS ${data.anioFiscal}`);
    console.log("Saving PDF...");
    doc.save(`utilidades_fraccionadas_${data.employee.cedula}_${data.anioFiscal}.pdf`);
}
