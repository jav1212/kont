import type { SalesPerformanceReportDto, SalesPerformanceDimensionDto } from "@kontave/client-contracts";
import {
    COLORS, PAGE, drawFooter, fill, formatN, hline, loadKontaLogo,
    renderLabel, renderMono, renderText, safeFilename,
} from "@/src/shared/frontend/utils/pdf-chrome";

const DIMENSION_LABELS: Record<SalesPerformanceDimensionDto, string> = {
    user: "Usuario",
    role: "Rol",
    device: "Dispositivo",
};

/**
 * Generates and downloads a printable PDF of a sales performance report.
 * @param report Report data returned by the sales reporting endpoint.
 * @param company Company name and RIF shown in the report header.
 * @returns A promise resolved after the PDF download is initiated.
 * @throws Propagates PDF generation errors to the caller.
 */
export async function generateSalesPerformanceReportPdf(
    report: SalesPerformanceReportDto,
    company: { name: string; rif: string },
): Promise<void> {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const width = doc.internal.pageSize.getWidth();
    const xL = PAGE.marginX;
    const xR = width - PAGE.marginX;
    const contentW = width - 2 * PAGE.marginX;

    renderText(doc, company.name, xL, 13, 12, true, COLORS.ink, "left", contentW / 2);
    renderMono(doc, `RIF ${company.rif}`, xL, 18.5, 8.5, false, COLORS.muted, "left");
    renderText(doc, "RENDIMIENTO DE VENTAS", xR, 13, 11, true, COLORS.ink, "right");
    renderMono(doc, DIMENSION_LABELS[report.dimension].toUpperCase(), xR, 19, 9, true, COLORS.orange, "right");
    hline(doc, xL, 26, contentW, COLORS.border, 0.2);

    renderLabel(doc, "Período", xL + 2, 34, "left", COLORS.muted, 6.5);
    renderText(doc, `${report.period.from} — ${report.period.to}`, xL + 2, 41, 9, true, COLORS.ink, "left");
    renderLabel(doc, "Moneda", xL + 90, 34, "left", COLORS.muted, 6.5);
    renderText(doc, "Bolívares (VES)", xL + 90, 41, 9, true, COLORS.ink, "left");
    renderLabel(doc, "Generado", xR, 34, "right", COLORS.muted, 6.5);
    renderText(doc, new Date(report.generatedAt).toLocaleString("es-VE"), xR, 41, 8, false, COLORS.ink, "right");

    let y = 51;
    fill(doc, xL, y, contentW, 7, COLORS.bandHead);
    renderLabel(doc, DIMENSION_LABELS[report.dimension], xL + 3, y + 4.7, "left", COLORS.inkMed, 7);
    renderLabel(doc, "Facturas", xR - 42, y + 4.7, "right", COLORS.inkMed, 7);
    renderLabel(doc, "Total vendido (Bs)", xR - 3, y + 4.7, "right", COLORS.inkMed, 7);
    y += 7;

    let invoiceCount = 0;
    let grossTotal = 0;
    for (const [index, row] of report.rows.entries()) {
        if (y > 265) {
            doc.addPage();
            y = 20;
        }
        if (index % 2 === 1) fill(doc, xL, y, contentW, 8, COLORS.rowAlt);
        const label = row.attributed ? row.label : "Sin atribución histórica";
        renderText(doc, label, xL + 3, y + 5.3, 8, false, COLORS.ink, "left", contentW - 92);
        renderMono(doc, String(row.invoiceCount), xR - 42, y + 5.3, 8, false, COLORS.ink, "right");
        renderMono(doc, formatN(Number(row.grossAmount.amount)), xR - 3, y + 5.3, 8, false, COLORS.ink, "right");
        hline(doc, xL, y + 8, contentW, COLORS.border, 0.15);
        y += 8;
        invoiceCount += row.invoiceCount;
        grossTotal += Number(row.grossAmount.amount);
    }

    y += 3;
    fill(doc, xL, y, contentW, 10, COLORS.bandHead);
    renderLabel(doc, `Total · ${invoiceCount} facturas`, xL + 3, y + 6.5, "left", COLORS.ink, 7);
    renderMono(doc, formatN(grossTotal), xR - 3, y + 6.5, 9, true, COLORS.ink, "right");
    drawFooter(doc, await loadKontaLogo());
    doc.save(`rendimiento-ventas-${safeFilename(company.name)}-${report.period.from}-${report.dimension}.pdf`);
}
