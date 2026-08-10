import type jsPDF from "jspdf";
import { formatN, fmtDateEs, safeFilename } from "@/src/shared/frontend/utils/pdf-chrome";
import { loadImageAsBase64 } from "@/src/modules/payroll/frontend/utils/pdf-image-helper";

export interface DeliveryNotePdfData {
    issuer: {
        name: string;
        rif: string;
        address?: string;
        phone?: string;
        logoUrl?: string;
        showLogoInPdf?: boolean;
    };
    customer: { name: string; rif?: string; address?: string };
    document: {
        number: string;
        date: string;
        time?: string;
        notes?: string;
        referenceRate?: number | null;
        referenceCurrency?: string;
    };
    items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        totalLine: number;
        currencyCode?: string;
        sourceUnitAmount?: number | null;
        exchangeRate?: number | null;
    }>;
    totals: { subtotal: number; discount?: number; iva: number; igtf: number; total: number };
}

const PAPER_WIDTH = 80;
const MARGIN = 4;
const CONTENT_WIDTH = PAPER_WIDTH - MARGIN * 2;

function setFont(doc: jsPDF, size: number, bold = false): void {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(20, 20, 20);
}

function center(doc: jsPDF, text: string, y: number, size: number, bold = false): number {
    setFont(doc, size, bold);
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    doc.text(lines, PAPER_WIDTH / 2, y, { align: "center" });
    return y + lines.length * (size * 0.42);
}

function labelValue(doc: jsPDF, label: string, value: string, y: number): number {
    setFont(doc, 8, false);
    doc.text(`${label}:`, MARGIN, y);
    const labelWidth = doc.getTextWidth(`${label}: `);
    const lines = doc.splitTextToSize(value || "-", CONTENT_WIDTH - labelWidth) as string[];
    doc.text(lines, MARGIN + labelWidth, y);
    return y + Math.max(1, lines.length) * 3.7;
}

function separatorLine(doc: jsPDF, y: number): number {
    doc.setDrawColor(145, 145, 145);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, y, PAPER_WIDTH - MARGIN, y);
    return y + 3;
}

function money(value: number): string {
    return formatN(value, 2);
}

export async function buildDeliveryNotePdf(data: DeliveryNotePdfData): Promise<jsPDF> {
    const { default: JsPDF } = await import("jspdf");
    const estimatedHeight = Math.max(150, 105 + data.items.length * 14 + (data.document.notes ? 18 : 0));
    const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: [PAPER_WIDTH, Math.min(297, estimatedHeight)] });
    const logo = data.issuer.showLogoInPdf && data.issuer.logoUrl
        ? await loadImageAsBase64(data.issuer.logoUrl).catch(() => null)
        : null;
    let y = 7;

    if (logo) {
        const props = doc.getImageProperties(logo);
        const width = Math.min(24, CONTENT_WIDTH);
        const height = Math.min(15, width * props.height / props.width);
        doc.addImage(logo, props.fileType || "PNG", (PAPER_WIDTH - width) / 2, y, width, height);
        y += height + 3;
    }

    y = center(doc, data.issuer.name, y, 10, true) + 1;
    y = center(doc, `RIF ${data.issuer.rif}`, y, 7.5);
    if (data.issuer.address) y = center(doc, data.issuer.address, y, 7);
    if (data.issuer.phone) y = center(doc, `Tel. ${data.issuer.phone}`, y, 7);
    y += 3;
    y += 2;
    y = center(doc, "NOTA DE ENTREGA", y, 11, true) + 1;
    y = center(doc, `No. ${data.document.number || "PENDIENTE"}`, y, 9, true) + 2;

    setFont(doc, 8);
    doc.text(`Fecha: ${fmtDateEs(data.document.date)}`, MARGIN, y);
    doc.text(`Hora: ${data.document.time ?? new Date().toLocaleTimeString("es-VE")}`, PAPER_WIDTH - MARGIN, y, { align: "right" });
    y += 5;
    y = labelValue(doc, "Cliente", data.customer.name, y);
    y = labelValue(doc, "RIF", data.customer.rif || "-", y);
    y = labelValue(doc, "Dirección", data.customer.address || "-", y) + 1;
    y = separatorLine(doc, y);
    setFont(doc, 7.5, true);
    doc.text("Cant", MARGIN, y);
    doc.text("Detalle", 12, y);
    doc.text("P/Unit.", 58, y, { align: "right" });
    doc.text("Total", PAPER_WIDTH - MARGIN, y, { align: "right" });
    y = separatorLine(doc, y + 2);

    for (const item of data.items) {
        setFont(doc, 7.5);
        const descriptionLines = doc.splitTextToSize(item.description, 31) as string[];
        doc.text(formatN(item.quantity, 2), 9, y, { align: "right" });
        doc.text(descriptionLines, 12, y);
        doc.text(money(item.unitPrice), 58, y, { align: "right" });
        doc.text(money(item.totalLine), PAPER_WIDTH - MARGIN, y, { align: "right" });
        y += Math.max(1, descriptionLines.length) * 3.6;
        if (item.currencyCode && item.currencyCode !== "VES" && item.sourceUnitAmount != null) {
            setFont(doc, 6.5);
            doc.setTextColor(90, 90, 90);
            doc.text(`${item.currencyCode} ${money(item.sourceUnitAmount)} · Tasa ${formatN(item.exchangeRate ?? 0, 4)}`, 12, y);
            y += 3.2;
        }
        y += 2;
    }

    y = separatorLine(doc, y);
    const totalRow = (label: string, value: number, bold = false) => {
        setFont(doc, bold ? 9 : 8, bold);
        doc.text(`${label}:`, 48, y, { align: "right" });
        doc.text(money(value), PAPER_WIDTH - MARGIN, y, { align: "right" });
        y += bold ? 5 : 4;
    };
    totalRow("Subtotal", data.totals.subtotal);
    totalRow("Descuento", data.totals.discount ?? 0);
    if (data.totals.iva) totalRow("IVA", data.totals.iva);
    if (data.totals.igtf) totalRow("IGTF", data.totals.igtf);
    setFont(doc, 14, true);
    doc.text("TOTAL:", MARGIN, y + 2);
    doc.text(money(data.totals.total), PAPER_WIDTH - MARGIN, y + 2, { align: "right" });
    y += 8;
    setFont(doc, 7);
    doc.text(`Cantidad de ítems: ${data.items.reduce((sum, item) => sum + item.quantity, 0)}`, PAPER_WIDTH - MARGIN, y, { align: "right" });
    y += 5;

    if (data.document.referenceRate) {
        setFont(doc, 8, true);
        doc.text(`REF. ${data.document.referenceCurrency ?? "USD"}: ${formatN(data.document.referenceRate, 4)}`, MARGIN, y);
        y += 5;
    }
    if (data.document.notes) {
        y = separatorLine(doc, y);
        setFont(doc, 7);
        doc.text(doc.splitTextToSize(`Observaciones: ${data.document.notes}`, CONTENT_WIDTH), MARGIN, y);
        y += 10;
    }
    y = separatorLine(doc, y);
    y = center(doc, "DOCUMENTO COMERCIAL - NO VÁLIDO COMO FACTURA FISCAL", y, 6.5, true) + 7;
    doc.setDrawColor(80, 80, 80);
    doc.line(10, y, 34, y);
    doc.line(46, y, 70, y);
    setFont(doc, 6.5);
    doc.text("Entregado por", 22, y + 3, { align: "center" });
    doc.text("Recibido por", 58, y + 3, { align: "center" });
    return doc;
}

export async function generateDeliveryNotePdf(data: DeliveryNotePdfData): Promise<void> {
    const doc = await buildDeliveryNotePdf(data);
    doc.save(safeFilename(`nota-entrega-${data.document.number}.pdf`));
}
