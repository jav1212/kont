import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";

interface Code128Encoder {
    new (value: string, options: Record<string, unknown>): { encode(): { data: string } };
}

interface EncodedAccessBadge {
    readonly email: string | null;
    readonly bits: string;
}

const BADGE_WIDTH_MM = 110;
const PAGE_MARGIN_MM = 12;
const BADGE_GAP_MM = 8;

function validateAccessBadge(input: { barcode: string; email: string | null }): void {
    if (!/^KONT-[A-Za-z0-9_-]{20,25}$/.test(input.barcode)) {
        throw new TypeError("El código del carnet no es válido.");
    }
}

function encodeAccessBadge(input: { barcode: string; email: string | null }): EncodedAccessBadge {
    const Code128 = (JsBarcode as unknown as { getModule(name: "CODE128"): Code128Encoder }).getModule("CODE128");
    return { email: input.email, bits: new Code128(input.barcode, {}).encode().data };
}

function createBadgeDocument(title: string): jsPDF {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", precision: 6 });
    pdf.setProperties({ title, creator: "Kontave" });
    return pdf;
}

function holderLines(pdf: jsPDF, email: string | null): string[] {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    return pdf.splitTextToSize(email?.trim() || "Usuario de Kontave", BADGE_WIDTH_MM - 16) as string[];
}

function badgeHeight(pdf: jsPDF, email: string | null): number {
    return 74 + (holderLines(pdf, email).length - 1) * 4.5;
}

function drawAccessBadge(pdf: jsPDF, badge: EncodedAccessBadge, top: number): number {
    const left = (pdf.internal.pageSize.getWidth() - BADGE_WIDTH_MM) / 2;
    const inset = left + 8;
    const lines = holderLines(pdf, badge.email);
    const dividerY = top + 23 + (lines.length - 1) * 4.5 + 7;
    const panelY = dividerY + 6;
    const height = panelY + 38 - top;

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(left, top, BADGE_WIDTH_MM, height, 3, 3, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setCharSpace(0.7);
    pdf.setTextColor(217, 58, 16);
    pdf.text("KONTAVE", inset, top + 8);
    pdf.setCharSpace(0);
    pdf.setFontSize(15);
    pdf.setTextColor(15, 23, 42);
    pdf.text("Carnet de acceso", inset, top + 16);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(71, 85, 105);
    lines.forEach((line, index) => pdf.text(line, inset, top + 23 + index * 4.5));
    pdf.setDrawColor(226, 232, 240);
    pdf.line(left, dividerY, left + BADGE_WIDTH_MM, dividerY);
    pdf.roundedRect(left + 6, panelY, BADGE_WIDTH_MM - 12, 32, 3, 3, "S");

    const quietModules = 10;
    const moduleWidth = (BADGE_WIDTH_MM - 16) / (badge.bits.length + 2 * quietModules);
    const barsLeft = inset + quietModules * moduleWidth;
    pdf.setFillColor(0, 0, 0);
    for (let index = 0; index < badge.bits.length;) {
        if (badge.bits[index] !== "1") { index++; continue; }
        const start = index;
        while (index < badge.bits.length && badge.bits[index] === "1") index++;
        pdf.rect(barsLeft + start * moduleWidth, panelY + 6, (index - start) * moduleWidth, 20, "F");
    }

    return height;
}

/**
 * Creates a printable access badge with vector bars and no readable credential.
 *
 * The returned document stays in memory until the caller downloads it. The
 * credential is never placed in PDF metadata or its filename; the holder's
 * display email remains visible in the document and its sanitized local part
 * identifies the download.
 *
 * @param input - The newly issued credential and its holder's display email.
 * @returns A single A4 page containing a 110 mm wide badge at its original scale.
 * @throws TypeError if the credential is not a supported Kontave badge value.
 */
export function createAccessBadgePdf(input: { barcode: string; email: string | null }): jsPDF {
    validateAccessBadge(input);
    const pdf = createBadgeDocument("Carnet de acceso");
    drawAccessBadge(pdf, encodeAccessBadge(input), PAGE_MARGIN_MM);
    return pdf;
}

/**
 * Creates printable access badges packed across as many A4 pages as needed.
 *
 * Each credential is rendered only as vector Code 128 bars; readable barcode
 * values are never added to PDF text or metadata.
 *
 * @param inputs - Newly issued credentials and their holder display emails.
 * @returns An A4 PDF containing every requested badge at its original scale.
 * @throws TypeError if the list is empty or any credential is unsupported.
 */
export function createAccessBadgesPdf(inputs: readonly { barcode: string; email: string | null }[]): jsPDF {
    if (inputs.length === 0) throw new TypeError("Debes seleccionar al menos un carnet.");
    inputs.forEach(validateAccessBadge);
    const badges = inputs.map(encodeAccessBadge);
    const pdf = createBadgeDocument("Carnets de acceso");
    const pageHeight = pdf.internal.pageSize.getHeight();
    let top = PAGE_MARGIN_MM;

    for (const badge of badges) {
        const height = badgeHeight(pdf, badge.email);
        if (top !== PAGE_MARGIN_MM && top + height > pageHeight - PAGE_MARGIN_MM) {
            pdf.addPage();
            top = PAGE_MARGIN_MM;
        }
        drawAccessBadge(pdf, badge, top);
        top += height + BADGE_GAP_MM;
    }

    return pdf;
}

/**
 * Creates a readable and filesystem-safe filename for an issued access badge.
 *
 * @param email - The holder email returned by the authorized badge issuance.
 * @returns A bounded PDF filename based only on the email local part.
 */
export function accessBadgeFilename(email: string | null): string {
    const localPart = email?.trim().split("@", 1)[0] ?? "";
    const safeHolder = localPart
        .normalize("NFKC")
        .replace(/[\u0000-\u001F\u007F<>:"/\\|?*]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[.\s-]+|[.\s-]+$/g, "")
        .slice(0, 64)
        .replace(/^[.\s-]+|[.\s-]+$/g, "");
    return `carnet-acceso-${safeHolder || "usuario"}.pdf`;
}
