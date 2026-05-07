// PDF generator: Reporte de Bono Socio Económico de Ayuda Alimenticia — pago
// mensual único. Estilo Konta — header naranja, tabla zebra, recuadros de firma
// con badge USD, footer Kontave compartido en cada página. Pie con fundamento
// legal detallado citando el Art. 105 de la LOTTT (beneficios sociales no
// remunerativos: provisión de comidas y alimentos).

import type jsPDF from "jspdf";
import { loadImageAsBase64 } from "./pdf-image-helper";
import {
    COLORS,
    PAGE,
    pageBounds,
    drawHeader,
    drawFooter,
    drawHeaderRow,
    drawRow,
    fill,
    hline,
    rect,
    formatN,
    formatVES,
    loadKontaLogo,
    renderText,
    renderMono,
    renderLabel,
    safeFilename,
} from "@/src/shared/frontend/utils/pdf-chrome";

export interface BonoGuerraEmployee {
    cedula: string;
    nombre: string;
    cargo:  string;
    estado: string;
}

export interface BonoGuerraOptions {
    companyName:    string;
    companyId?:     string;
    periodLabel:    string;
    payrollDate:    string;
    montoUSD:       number;
    bcvRate:        number;
    logoUrl?:       string;
    showLogoInPdf?: boolean;
}

const fmtUSD = (n: number) => "$ " + formatN(n);

type Doc = jsPDF;

interface PageHeader {
    companyName: string;
    companyRif?: string;
    periodLabel: string;
}

function repaintPageHeader(doc: Doc, opts: PageHeader): number {
    drawHeader(doc, {
        companyName: opts.companyName,
        companyRif:  opts.companyRif,
        reportTitle: "Bono Socio Económico",
        periodLabel: opts.periodLabel,
    });
    return PAGE.contentTop as number;
}

function drawParamsCard(doc: Doc, x: number, w: number, y: number, montoUSD: number, bcvRate: number): number {
    const H = 14;
    fill(doc, x, y, w, H, COLORS.rowAlt);
    fill(doc, x, y, 1.5, H, COLORS.orange);
    rect(doc, x, y, w, H, COLORS.border, 0.2);

    const cx1 = x + 4;
    const cx2 = x + w * 0.36;
    const cx3 = x + w - 3;

    const montoVES = montoUSD * bcvRate;

    renderLabel(doc, "Monto por empleado", cx1, y + 5, "left", COLORS.muted, 7);
    renderMono(doc, fmtUSD(montoUSD), cx1, y + 11, 10, true, COLORS.ink, "left");

    renderLabel(doc, "Tasa BCV", cx2, y + 5, "left", COLORS.muted, 7);
    renderMono(doc, `Bs. ${formatN(bcvRate)} / USD`, cx2, y + 11, 10, true, COLORS.inkMed, "left");

    renderLabel(doc, "Equiv. por empleado", cx3, y + 5, "right", COLORS.muted, 7);
    renderMono(doc, formatVES(montoVES), cx3, y + 11, 10, true, COLORS.ink, "right");

    return y + H + 5;
}

export async function generateBonoGuerraPdf(
    employees: BonoGuerraEmployee[],
    opts: BonoGuerraOptions,
): Promise<void> {
    const active = employees.filter((e) => e.estado === "activo");
    if (active.length === 0) return;

    const [companyLogo, kontaLogo] = await Promise.all([
        opts.showLogoInPdf && opts.logoUrl
            ? loadImageAsBase64(opts.logoUrl).catch(() => null)
            : Promise.resolve(null),
        loadKontaLogo(),
    ]);

    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = doc.internal.pageSize.getWidth();
    const ML = 12, W = PW - 2 * ML;

    const pageHeader: PageHeader = {
        companyName: opts.companyName,
        companyRif:  opts.companyId,
        periodLabel: opts.periodLabel,
    };

    let y = repaintPageHeader(doc, pageHeader);

    if (companyLogo) {
        try { doc.addImage(companyLogo, "JPEG", ML, y, 18, 7, undefined, "FAST"); y += 9; } catch { /* */ }
    }

    y = drawParamsCard(doc, ML, W, y, opts.montoUSD, opts.bcvRate);

    // ── Table header ──────────────────────────────────────────────────────────
    const colN     = W * 0.07;
    const colName  = W * 0.40;
    const colCed   = W * 0.18;
    const colUSD   = W * 0.16;
    const colVES   = W * 0.19;
    const drawTH = (yy: number): number => {
        drawHeaderRow(doc, yy, 6, [
            { x: ML,                                        w: colN,    text: "N°",         align: "center" },
            { x: ML + colN,                                 w: colName, text: "Nombre",     align: "left"   },
            { x: ML + colN + colName,                       w: colCed,  text: "Cédula",     align: "left"   },
            { x: ML + colN + colName + colCed,              w: colUSD,  text: "Monto USD",  align: "right"  },
            { x: ML + colN + colName + colCed + colUSD,     w: colVES,  text: "Equiv. VES", align: "right"  },
        ]);
        return yy + 6;
    };

    y = drawTH(y);

    const montoVES = opts.montoUSD * opts.bcvRate;
    const ROW_H = 6;
    active.forEach((emp, i) => {
        if (y + ROW_H > pageBounds(doc).contentBot) {
            doc.addPage();
            y = repaintPageHeader(doc, pageHeader);
            y = drawTH(y);
        }
        drawRow(doc, y, ROW_H, [
            { x: ML,                                       w: colN,    text: String(i + 1),         align: "center", size: 8.5, mono: true,            color: COLORS.muted },
            { x: ML + colN,                                w: colName, text: emp.nombre,            align: "left",   size: 8.5,                       color: COLORS.ink },
            { x: ML + colN + colName,                      w: colCed,  text: emp.cedula,            align: "left",   size: 8.5, mono: true,            color: COLORS.muted },
            { x: ML + colN + colName + colCed,             w: colUSD,  text: fmtUSD(opts.montoUSD), align: "right",  size: 9,   mono: true, bold: true, color: COLORS.ink },
            { x: ML + colN + colName + colCed + colUSD,    w: colVES,  text: formatVES(montoVES),   align: "right",  size: 9,   mono: true, bold: true, color: COLORS.ink },
        ], { zebra: i % 2 === 1 });
        y += ROW_H;
    });

    y += 2;

    // ── Totals row (orange-accented) ──────────────────────────────────────────
    if (y + 14 > pageBounds(doc).contentBot) {
        doc.addPage();
        y = repaintPageHeader(doc, pageHeader);
    }

    const totalUSD = opts.montoUSD * active.length;
    const totalVES = montoVES * active.length;

    fill(doc, ML, y, W, 0.5, COLORS.orange);
    y += 1.2;
    fill(doc, ML, y, W, 12, COLORS.bandHead);
    rect(doc, ML, y, W, 12, COLORS.border, 0.2);
    renderLabel(doc, `Total · ${active.length} empleado${active.length !== 1 ? "s" : ""}`, ML + 3, y + 7.8, "left", COLORS.inkMed, 9);
    renderMono(doc, fmtUSD(totalUSD),  ML + colN + colName + colCed + colUSD - 1, y + 7.8, 10, true, COLORS.ink, "right");
    renderMono(doc, formatVES(totalVES), ML + W - 3, y + 8.2, 10.5, true, COLORS.ink, "right");
    y += 12 + 8;

    // ── Signature boxes ───────────────────────────────────────────────────────
    if (y + 8 > pageBounds(doc).contentBot) {
        doc.addPage();
        y = repaintPageHeader(doc, pageHeader);
    }
    renderLabel(doc, "Firma de recibo", ML, y, "left", COLORS.inkMed, 8);
    y += 6;

    const SIG_W = (W - 8) / 3;
    const SIG_H = 40;       // 28 → 40 mm: canvas vacío de ~12 mm para la firma manuscrita
    const GAP   = 4;
    const PD    = 3;
    const CB    = 2.5;
    const SIG_LINE_Y_OFFSET   = 6;  // distancia desde el borde inferior a la línea
    const SIG_LABEL_Y_OFFSET  = 1.5;

    active.forEach((emp, i) => {
        const col = i % 3;
        const sx  = ML + col * (SIG_W + GAP);

        if (col === 0 && i > 0 && y + SIG_H > pageBounds(doc).contentBot) {
            doc.addPage();
            y = repaintPageHeader(doc, pageHeader);
        }

        fill(doc, sx, y, SIG_W, SIG_H, COLORS.white);
        rect(doc, sx, y, SIG_W, SIG_H, COLORS.border, 0.25);
        fill(doc, sx, y, SIG_W, 1, COLORS.orange);

        // ── Header card: monto USD (top-right) ───────────────────────────────
        renderMono(doc, fmtUSD(opts.montoUSD), sx + SIG_W - PD, y + 6, 8.5, true, COLORS.ink, "right");

        // ── Identificación del empleado ─────────────────────────────────────
        renderText(doc, emp.nombre, sx + PD, y + 10.5, 9, true, COLORS.ink, "left", SIG_W - PD * 2, "helvetica");
        renderMono(doc, emp.cedula, sx + PD, y + 14.5, 7.8, false, COLORS.muted, "left");
        renderMono(doc, formatVES(montoVES), sx + PD, y + 18.5, 7.8, false, COLORS.muted, "left");

        // ── Checkbox de modalidad ───────────────────────────────────────────
        rect(doc, sx + PD, y + 21, CB, CB, COLORS.borderStr, 0.3);
        renderText(doc, "Recibido (efectivo / transferencia)", sx + PD + CB + 1.5, y + 23.5, 7, false, COLORS.muted, "left", SIG_W - PD * 2 - CB - 2, "helvetica");

        // ── Canvas blanco para firma manuscrita (≈12 mm) ────────────────────
        // Espacio entre y+25 y y+SIG_H-SIG_LINE_Y_OFFSET = y+34, pensado para
        // que el trabajador firme con bolígrafo sobre la línea.

        // ── Línea de firma + label ──────────────────────────────────────────
        hline(doc, sx + PD, y + SIG_H - SIG_LINE_Y_OFFSET, SIG_W - PD * 2, COLORS.borderStr, 0.3);
        renderLabel(doc, "Firma", sx + SIG_W / 2, y + SIG_H - SIG_LABEL_Y_OFFSET, "center", COLORS.muted, 7);

        if (col === 2 || i === active.length - 1) y += SIG_H + 5;
    });

    // ── Fundamento legal ──────────────────────────────────────────────────────
    // Detalla el Art. 105 LOTTT (beneficios sociales no remunerativos) y lista
    // las consecuencias de su naturaleza no salarial sobre prestaciones,
    // vacaciones, utilidades y aportes patronales.

    const FONT_LEGAL    = 7.6;
    const LINE_H_LEGAL  = 3.3;
    const SECTION_TITLE = "FUNDAMENTO LEGAL — ART. 105 LOTTT";

    const legalParas: string[] = [
        "El presente reporte acredita el pago del BONO SOCIO ECONÓMICO DE AYUDA " +
        "ALIMENTICIA (anteriormente denominado «Bono Contra la Guerra Económica») " +
        "correspondiente al período indicado, otorgado por el patrono como ayuda " +
        "alimentaria a sus trabajadores y trabajadoras.",

        "Este beneficio se enmarca en el Artículo 105 de la Ley Orgánica del Trabajo, " +
        "los Trabajadores y las Trabajadoras (LOTTT), el cual establece que se " +
        "consideran beneficios sociales de carácter NO REMUNERATIVO, entre otros: " +
        "(1) los servicios de comedores y la provisión de comidas y alimentos, " +
        "(2) los reintegros de gastos médicos, farmacéuticos y odontológicos, " +
        "(3) las provisiones de ropa de trabajo, (4) las provisiones de útiles " +
        "escolares y juguetes, (5) el otorgamiento de becas o pago de cursos de " +
        "capacitación, formación o especialización y (6) el pago de gastos funerarios. " +
        "El presente bono se otorga bajo el numeral (1), como provisión de comidas y alimentos.",

        "De conformidad con el último aparte del Art. 105 LOTTT, los beneficios sociales " +
        "NO SERÁN CONSIDERADOS COMO SALARIO, salvo que en convenciones colectivas o " +
        "contratos individuales de trabajo se estipule lo contrario.",

        "En consecuencia, este pago NO forma parte del salario normal ni del salario " +
        "integral y NO es cuantificable a efectos del cálculo de: prestaciones sociales " +
        "(Art. 142 LOTTT), vacaciones y bono vacacional (Art. 192 LOTTT), utilidades " +
        "(Arts. 131–132 LOTTT), días feriados y de descanso semanal, ni de los aportes " +
        "patronales al IVSS, FAOV (BANAVIH), INCES y Régimen Prestacional de Empleo.",

        "El trabajador deja constancia de la recepción íntegra del beneficio mediante su firma.",
    ];

    // Pre-cálculo de altura para decidir si requiere salto de página.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(FONT_LEGAL);
    const wrappedParas = legalParas.map((p) => doc.splitTextToSize(p, W) as string[]);
    const totalLegalLines = wrappedParas.reduce((a, ls) => a + ls.length, 0);
    const PARA_GAP = 1.6;
    const TITLE_BLOCK_H = 7.5;
    const legalHeight = TITLE_BLOCK_H + totalLegalLines * LINE_H_LEGAL + (legalParas.length - 1) * PARA_GAP + 4;

    if (y + legalHeight > pageBounds(doc).contentBot) {
        doc.addPage();
        y = repaintPageHeader(doc, pageHeader);
    }

    hline(doc, ML, y, W, COLORS.border, 0.2);
    y += 4;

    renderLabel(doc, SECTION_TITLE, ML, y, "left", COLORS.inkMed, 8);
    fill(doc, ML, y + 1.6, 18, 0.5, COLORS.orange);
    y += TITLE_BLOCK_H;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(FONT_LEGAL);
    doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);

    wrappedParas.forEach((lines, idx) => {
        lines.forEach((ln, i) => doc.text(ln, ML, y + i * LINE_H_LEGAL));
        y += lines.length * LINE_H_LEGAL;
        if (idx < wrappedParas.length - 1) y += PARA_GAP;
    });

    drawFooter(doc, kontaLogo);

    doc.save(
        `bono-socio-economico-${safeFilename(opts.companyName)}-${opts.payrollDate.replaceAll("-", "")}.pdf`,
    );
}
