import { TreasuryFailure } from "../domain/failure";

/** A scalar value that can be safely represented in a Treasury tabular report. */
export type TreasuryReportCell = string | number | boolean | null;
/** Authorized report snapshot returned by the Treasury query model. */
export interface TreasuryReportSnapshot { readonly title: string; readonly generatedAt: string; readonly columns: readonly string[]; readonly rows: readonly Readonly<Record<string, TreasuryReportCell>>[]; }
/** Binary document created by a platform-specific PDF implementation. */
export interface TreasuryPdfDocument { readonly mediaType: "application/pdf"; readonly bytes: Uint8Array; readonly fileName: string; }
/** Rendering boundary; PDF libraries remain outside Treasury domain and application rules. */
export interface TreasuryReportRenderer {
  /** @param snapshot - Authorized fixed report data. @returns A PDF document matching the supplied rows and columns. @throws {TreasuryFailure} When rendering cannot complete. */
  renderPdf(snapshot: TreasuryReportSnapshot): Promise<TreasuryPdfDocument>;
}
/** Converts a report snapshot to RFC 4180 compatible UTF-8 CSV content. @param snapshot - Authorized immutable report data. @returns CSV text with a header and one row per snapshot item. @throws {TreasuryFailure} When columns, title, or rows are malformed. */
export function renderTreasuryCsv(snapshot: TreasuryReportSnapshot): string {
  validateSnapshot(snapshot); const lines = [snapshot.columns.map(csv).join(",")];
  for (const row of snapshot.rows) lines.push(snapshot.columns.map(column => csv(row[column] ?? null)).join(","));
  return lines.join("\r\n");
}
/** Delegates PDF creation to an injected platform adapter after portable snapshot validation. @param renderer - Platform PDF renderer. @param snapshot - Authorized immutable report data. @returns A PDF whose source is exactly the supplied snapshot. @throws {TreasuryFailure} When validation or rendering fails. */
export async function renderTreasuryPdf(renderer: TreasuryReportRenderer, snapshot: TreasuryReportSnapshot): Promise<TreasuryPdfDocument> {
  validateSnapshot(snapshot);
  try { return await renderer.renderPdf(snapshot); }
  catch (cause: unknown) { if (cause instanceof TreasuryFailure) throw cause; throw new TreasuryFailure("UNAVAILABLE", "Treasury PDF renderer is unavailable.", cause instanceof Error ? { cause } : undefined); }
}
function validateSnapshot(snapshot: TreasuryReportSnapshot): void { if (!snapshot.title.trim() || !snapshot.generatedAt.trim() || !snapshot.columns.length || new Set(snapshot.columns).size !== snapshot.columns.length || snapshot.columns.some(column => !column.trim())) throw new TreasuryFailure("INVALID", "Treasury report snapshot is invalid."); }
function csv(value: TreasuryReportCell): string { const text = value === null ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
