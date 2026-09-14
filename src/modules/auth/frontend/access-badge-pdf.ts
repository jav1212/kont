import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";

interface Code128Encoder {
    new (value: string, options: Record<string, unknown>): { encode(): { data: string } };
}

/**
 * Creates a printable access badge with vector bars and no readable credential.
 *
 * The returned document stays in memory until the caller downloads it. Neither
 * the credential nor the holder is placed in PDF metadata or a filename.
 *
 * @param input - The newly issued credential and its holder's display email.
 * @returns A single A4 page containing a 110 mm wide badge at its original scale.
 * @throws TypeError if the credential is not a supported Kontave badge value.
 */
export function createAccessBadgePdf(input: { barcode: string; email: string | null }): jsPDF {
    if (!/^KONT-[A-Za-z0-9_-]{20,25}$/.test(input.barcode)) {
        throw new TypeError("El código del carnet no es válido.");
    }

    // Use the same installed encoder as the on-screen SVG; vector rectangles
    // preserve narrow modules when printing without raster scaling artifacts.
    const Code128 = (JsBarcode as unknown as { getModule(name: "CODE128"): Code128Encoder }).getModule("CODE128");
    const bits = new Code128(input.barcode, {}).encode().data;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", precision: 6 });
    pdf.setProperties({ title: "Carnet de acceso", creator: "Kontave" });

    const width = 110;
    const left = (pdf.internal.pageSize.getWidth() - width) / 2;
    const top = 12;
    const inset = left + 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    const holderLines = pdf.splitTextToSize(input.email?.trim() || "Usuario de Kontave", width - 16) as string[];
    const dividerY = top + 23 + (holderLines.length - 1) * 4.5 + 7;
    const panelY = dividerY + 6;
    const height = panelY + 38 - top;

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(left, top, width, height, 3, 3, "FD");
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
    holderLines.forEach((line, index) => pdf.text(line, inset, top + 23 + index * 4.5));
    pdf.setDrawColor(226, 232, 240);
    pdf.line(left, dividerY, left + width, dividerY);
    pdf.roundedRect(left + 6, panelY, width - 12, 32, 3, 3, "S");

    const quietModules = 10;
    const moduleWidth = (width - 16) / (bits.length + 2 * quietModules);
    const barsLeft = inset + quietModules * moduleWidth;
    pdf.setFillColor(0, 0, 0);
    for (let index = 0; index < bits.length;) {
        if (bits[index] !== "1") { index++; continue; }
        const start = index;
        while (index < bits.length && bits[index] === "1") index++;
        pdf.rect(barsLeft + start * moduleWidth, panelY + 6, (index - start) * moduleWidth, 20, "F");
    }

    return pdf;
}
