import { jsPDF } from "jspdf";
import type { TreasuryPdfDocument, TreasuryReportRenderer, TreasuryReportSnapshot } from "../../application/reporting";
import { TreasuryFailure } from "../../domain/failure";

/** jsPDF implementation used by composition roots that elect this report renderer. */
export class JsPdfTreasuryReportRenderer implements TreasuryReportRenderer {
  /** @param fileNamePrefix - Prefix used for the generated PDF download name. */
  public constructor(private readonly fileNamePrefix = "treasury-report") {}
  /** @param snapshot - Authorized report rows and columns. @returns A PDF document containing that fixed snapshot. @throws {TreasuryFailure} When jsPDF cannot generate the document. */
  public async renderPdf(snapshot: TreasuryReportSnapshot): Promise<TreasuryPdfDocument> {
    try {
      const document = new jsPDF(); let y = 18;
      document.setFontSize(14); document.text(snapshot.title, 14, y); y += 8;
      document.setFontSize(8); document.text(snapshot.generatedAt, 14, y); y += 8;
      document.setFontSize(9); document.text(snapshot.columns.join(" | "), 14, y); y += 6;
      for (const row of snapshot.rows) {
        const line = snapshot.columns.map(column => String(row[column] ?? "")).join(" | ");
        if (y > 280) { document.addPage(); y = 18; }
        document.text(document.splitTextToSize(line, 180), 14, y); y += 6;
      }
      return { mediaType: "application/pdf", bytes: new Uint8Array(document.output("arraybuffer")), fileName: `${this.fileNamePrefix}.pdf` };
    } catch (cause: unknown) { throw new TreasuryFailure("UNAVAILABLE", "Treasury PDF renderer could not generate the report.", cause instanceof Error ? { cause } : undefined); }
  }
}
