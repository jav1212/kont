// ============================================================================
// CESTA TICKET PDF — Reporte de Ticket de Alimentación (Art. 5 LOPCYMAT / LOTTT)
// Solo aplica para la segunda quincena del mes.
// ============================================================================

import jsPDF from "jspdf";

export interface CestaTicketEmployee {
    cedula:  string;
    nombre:  string;
    cargo:   string;
    estado:  string;
}

export interface CestaTicketOptions {
    companyName:  string;
    companyId?:   string;
    periodLabel:  string;   // "16–31 de Marzo 2026"
    payrollDate:  string;   // ISO date for filename
    montoUSD:     number;   // monto por empleado (default 40)
    bcvRate:      number;   // tasa BCV para conversión a VES
}

type RGB = [number, number, number];

const C = {
    ink:       [15,  15,  20]  as RGB,
    inkMed:    [50,  50,  60]  as RGB,
    muted:     [120, 120, 132] as RGB,
    border:    [218, 218, 226] as RGB,
    borderMed: [175, 175, 185] as RGB,
    bg:        [246, 246, 250] as RGB,
    rowAlt:    [240, 240, 245] as RGB,
    white:     [255, 255, 255] as RGB,
    primary:   [8,   145, 178] as RGB,
    accent:    [34,  211, 238] as RGB,
    header:    [18,  18,  26]  as RGB,
    green:     [22,  101, 52]  as RGB,
};

const fill = (doc: jsPDF, x: number, y: number, w: number, h: number, c: RGB) => {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(x, y, w, h, "F");
};

const box = (doc: jsPDF, x: number, y: number, w: number, h: number, fc: RGB, sc: RGB, lw = 0.2) => {
    doc.setFillColor(fc[0], fc[1], fc[2]);
    doc.setDrawColor(sc[0], sc[1], sc[2]);
    doc.setLineWidth(lw);
    doc.rect(x, y, w, h, "FD");
};

const hline = (doc: jsPDF, x: number, y: number, w: number, c: RGB = C.border, lw = 0.2) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(lw);
    doc.line(x, y, x + w, y);
};

const txt = (
    doc: jsPDF, text: string,
    x: number, y: number, size: number, bold: boolean,
    color: RGB, align: "left" | "center" | "right" = "left",
    maxW?: number,
) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setCharSpace(0);

    const str = maxW
        ? ((doc.splitTextToSize(text, maxW) as string[])[0] ?? "")
        : text;

    let ax = x;
    if (align === "right")  ax = x - doc.getTextWidth(str);
    if (align === "center") ax = x - doc.getTextWidth(str) / 2;

    doc.text(str, ax, y);
};

const lbl = (doc: jsPDF, text: string, x: number, y: number, align: "left" | "right" | "center" = "left") => {
    txt(doc, text.toUpperCase(), x, y, 5, false, C.muted, align);
};

const fmtNum = (n: number): string => {
    const [int, dec] = n.toFixed(2).split(".");
    const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return intFmt + "," + dec;
};

const fmtVES = (n: number) => "Bs. " + fmtNum(n);
const fmtUSD = (n: number) => "$ "   + fmtNum(n);

// ── Draws the header on any page ──────────────────────────────────────────────
function drawPageBg(doc: jsPDF, PW: number, PH: number) {
    fill(doc, 0, 0, PW, PH, C.bg);
}

function drawFooter(doc: jsPDF, PW: number, PH: number, opts: CestaTicketOptions) {
    fill(doc, 0, PH - 10, PW, 10, C.header);
    fill(doc, 0, PH - 10, PW, 1, C.accent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(90, 90, 108);
    doc.text(
        `${opts.companyName.toUpperCase()}  ·  ${opts.periodLabel}  ·  DOCUMENTO CONFIDENCIAL`,
        PW / 2, PH - 4, { align: "center" },
    );
}

export function generateCestaTicketPdf(
    employees: CestaTicketEmployee[],
    opts: CestaTicketOptions,
): void {
    const active = employees.filter((e) => e.estado === "activo");
    if (active.length === 0) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 13;
    const MR = PW - 13;
    const W  = MR - ML;

    drawPageBg(doc, PW, PH);

    // ── HEADER ────────────────────────────────────────────────────────────
    const HDR_H = 38;
    fill(doc, 0, 0, PW, HDR_H, C.header);
    fill(doc, 0, HDR_H - 2, PW, 2, C.accent);
    fill(doc, 0, 0, 4, HDR_H - 2, C.primary);

    txt(doc, opts.companyName.toUpperCase(), ML + 2, 10, 11, true, C.white);
    if (opts.companyId) txt(doc, `RIF: ${opts.companyId}`, ML + 2, 16.5, 6.5, false, [150, 150, 168]);
    txt(doc, "REPORTE DE CESTA TICKET — 2ª QUINCENA", ML + 2, 23, 6, false, [100, 100, 120]);

    txt(doc, opts.periodLabel.toUpperCase(), MR, 18, 8, true, C.white, "right");
    txt(doc,
        `Emitido: ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}`,
        MR, 26, 5.5, false, [100, 100, 118], "right"
    );

    let y = HDR_H + 6;

    // ── PARAMS CARD ───────────────────────────────────────────────────────
    const montoVES = opts.montoUSD * opts.bcvRate;
    box(doc, ML, y, W, 12, C.white, C.border, 0.3);
    fill(doc, ML, y, 3, 12, C.primary);

    const cx1 = ML + 8;
    const cx2 = ML + W * 0.35;
    const cx3 = MR - 4;

    lbl(doc, "Monto por empleado", cx1, y + 4.5);
    txt(doc, fmtUSD(opts.montoUSD), cx1, y + 9.5, 8, true, C.primary);
    lbl(doc, "Tasa BCV", cx2, y + 4.5);
    txt(doc, `Bs. ${opts.bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2 })} / USD`, cx2, y + 9.5, 8, true, C.inkMed);
    lbl(doc, "Equiv. por empleado", cx3, y + 4.5, "right");
    txt(doc, fmtVES(montoVES), cx3, y + 9.5, 8, true, C.green, "right");

    y += 12 + 5;

    // ── TABLE ─────────────────────────────────────────────────────────────
    const COL_N    = ML;
    const COL_NAME = ML + 10;
    const COL_CED  = ML + W * 0.44;
    const COL_USD  = ML + W * 0.62;
    const COL_VES  = ML + W * 0.78;

    // Table header
    const TH_H = 6.5;
    fill(doc, ML, y, W, TH_H, C.header);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);

    const th = (text: string, x: number, align: "left" | "right" | "center" = "left") =>
        doc.text(text.toUpperCase(), x, y + 4.3, { align });

    th("N°",         COL_N + 4);
    th("Nombre",     COL_NAME);
    th("Cédula",     COL_CED);
    th("Monto USD",  COL_USD);
    th("Equiv. VES", COL_VES);

    y += TH_H;

    const ROW_H = 7;
    active.forEach((emp, i) => {
        const rowBg = i % 2 === 0 ? C.white : C.rowAlt;
        fill(doc, ML, y, W, ROW_H, rowBg);
        hline(doc, ML, y + ROW_H, W, C.border, 0.1);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
        doc.text(String(i + 1), COL_N + 4, y + 4.6);

        doc.setTextColor(C.inkMed[0], C.inkMed[1], C.inkMed[2]);
        const maxNameW = COL_CED - COL_NAME - 3;
        const nameLines: string[] = doc.splitTextToSize(emp.nombre, maxNameW);
        doc.text(nameLines[0], COL_NAME, y + 4.6);

        doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
        doc.text(emp.cedula, COL_CED, y + 4.6);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(C.primary[0], C.primary[1], C.primary[2]);
        doc.text(fmtUSD(opts.montoUSD), COL_USD, y + 4.6);

        doc.setTextColor(C.green[0], C.green[1], C.green[2]);
        doc.text(fmtVES(montoVES), COL_VES, y + 4.6);

        y += ROW_H;

        // New page if not enough room for totals + signatures
        if (y > PH - 55 && i < active.length - 1) {
            drawFooter(doc, PW, PH, opts);
            doc.addPage();
            drawPageBg(doc, PW, PH);
            y = 15;
        }
    });

    y += 4;

    // ── TOTALS ────────────────────────────────────────────────────────────
    const totalUSD = opts.montoUSD * active.length;
    const totalVES = montoVES * active.length;

    fill(doc, ML, y, W, 10, C.header);
    fill(doc, ML, y, 3, 10, C.accent);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(`TOTAL  ·  ${active.length} EMPLEADOS`, ML + 8, y + 6);

    doc.setTextColor(C.accent[0], C.accent[1], C.accent[2]);
    doc.text(fmtUSD(totalUSD), COL_USD, y + 6);

    doc.setTextColor(C.green[0], C.green[1], C.green[2]);
    doc.text(fmtVES(totalVES), COL_VES, y + 6);

    y += 10 + 8;

    // ── SIGNATURE BOXES (3 per row) ───────────────────────────────────────
    // Header for signature section
    txt(doc, "FIRMA DE RECIBO", ML, y, 6, true, C.inkMed);
    y += 5;

    const SIG_W  = (W - 8) / 3;   // 3 per row, 4mm gap between
    const SIG_H  = 32;            // taller para acomodar checkbox
    const SIG_PD = 4;
    const GAP    = 4;
    const CB     = 3;             // checkbox size (mm)

    active.forEach((emp, i) => {
        const col = i % 3;
        const sx  = ML + col * (SIG_W + GAP);

        // New page if box doesn't fit
        if (col === 0 && i > 0 && y + SIG_H > PH - 18) {
            drawFooter(doc, PW, PH, opts);
            doc.addPage();
            drawPageBg(doc, PW, PH);
            y = 20;
        }

        // Box
        box(doc, sx, y, SIG_W, SIG_H, C.white, C.border, 0.25);
        fill(doc, sx, y, SIG_W, 1.5, C.primary);

        // Monto badge top-right
        txt(doc, fmtUSD(opts.montoUSD), sx + SIG_W - SIG_PD, y + 6.5, 5.5, true, C.primary, "right");

        // Name + cédula
        txt(doc, emp.nombre, sx + SIG_PD, y + 11, 6.5, true, C.inkMed, "left", SIG_W - SIG_PD * 2);
        txt(doc, emp.cedula, sx + SIG_PD, y + 15.5, 5, false, C.muted);

        // Equivalente VES
        txt(doc, fmtVES(montoVES), sx + SIG_PD, y + 19.5, 5, false, C.green);

        // Checkbox "recibido en bolívares en efectivo"
        const cbX = sx + SIG_PD;
        const cbY = y + 21.5;
        doc.setDrawColor(C.borderMed[0], C.borderMed[1], C.borderMed[2]);
        doc.setLineWidth(0.35);
        doc.rect(cbX, cbY, CB, CB);
        txt(doc, "Recibido en Bs. efectivo", cbX + CB + 1.5, cbY + CB - 0.3, 4, false, [100, 100, 120] as RGB);

        // Signature line
        hline(doc, sx + SIG_PD, y + SIG_H - 4, SIG_W - SIG_PD * 2, C.borderMed, 0.35);
        txt(doc, "FIRMA", sx + SIG_W / 2, y + SIG_H - 1, 4, false, C.muted, "center");

        // Advance y after every 3 boxes
        if (col === 2 || i === active.length - 1) {
            y += SIG_H + 4;
        }
    });

    // ── LEGAL NOTE ────────────────────────────────────────────────────────
    if (y + 18 > PH - 18) {
        drawFooter(doc, PW, PH, opts);
        doc.addPage();
        drawPageBg(doc, PW, PH);
        y = 20;
    }

    hline(doc, ML, y, W, C.border, 0.25);
    y += 4;

    const legal =
        "El presente reporte acredita el pago del beneficio de alimentación (cesta ticket) correspondiente " +
        "a la segunda quincena del período indicado, de conformidad con la Ley de Alimentación para los " +
        "Trabajadores y las Trabajadoras (LOTTT). El trabajador confirma la recepción de dicho beneficio " +
        "con su firma en el recuadro correspondiente.";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    const legalLines: string[] = doc.splitTextToSize(legal, W);
    legalLines.forEach((line: string, i: number) => {
        doc.text(line, ML, y + 3.5 + i * 3.5);
    });

    drawFooter(doc, PW, PH, opts);
    doc.save(`cesta_ticket_${opts.payrollDate.replaceAll("-", "")}.pdf`);
}
