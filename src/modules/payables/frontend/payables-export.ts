"use client";

/** One exported column: header text and how to read its cell from a row. */
export interface PayablesExportColumn<TRow> {
  readonly header: string;
  readonly value: (row: TRow) => string;
  /** Right-aligns numeric columns in the PDF. */
  readonly numeric?: boolean;
}

/** Downloads rows as a UTF-8 CSV with a BOM so spreadsheet apps keep accents.
 * Amounts are exported as received from the API (dot decimal, exact text).
 * @param fileName - Download name without extension.
 * @param columns - Ordered columns to export.
 * @param rows - Rows exactly as shown on screen.
 * @returns Nothing; the browser starts the download.
 * @throws Never.
 */
export function exportPayablesCsv<TRow>(fileName: string, columns: readonly PayablesExportColumn<TRow>[], rows: readonly TRow[]): void {
  const escape = (value: string) => /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [columns.map((column) => escape(column.header)).join(","), ...rows.map((row) => columns.map((column) => escape(column.value(row))).join(","))];
  download(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `${fileName}.csv`);
}

/** Downloads rows as a landscape A4 PDF table with the same data as the screen.
 * @param fileName - Download name without extension.
 * @param title - Report title printed on every page.
 * @param subtitle - Company, filters and generation date.
 * @param columns - Ordered columns to print.
 * @param rows - Rows exactly as shown on screen.
 * @returns A promise resolved once the download starts.
 * @throws Never; jsPDF is loaded on demand.
 */
export async function exportPayablesPdf<TRow>(fileName: string, title: string, subtitle: string, columns: readonly PayablesExportColumn<TRow>[], rows: readonly TRow[]): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 10;
  const width = 297 - margin * 2;
  const columnWidth = width / Math.max(columns.length, 1);
  let y = 0;
  const header = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(title, margin, 14);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(subtitle, margin, 19);
    doc.setFont("helvetica", "bold");
    columns.forEach((column, index) => doc.text(fit(doc, column.header, columnWidth - 2), column.numeric ? margin + columnWidth * (index + 1) - 1 : margin + columnWidth * index, 27, { align: column.numeric ? "right" : "left" }));
    doc.line(margin, 29, margin + width, 29);
    doc.setFont("helvetica", "normal");
    y = 34;
  };
  header();
  for (const row of rows) {
    if (y > 200) { doc.addPage(); header(); }
    columns.forEach((column, index) => doc.text(fit(doc, column.value(row), columnWidth - 2), column.numeric ? margin + columnWidth * (index + 1) - 1 : margin + columnWidth * index, y, { align: column.numeric ? "right" : "left" }));
    y += 5;
  }
  if (rows.length === 0) doc.text("Sin registros.", margin, y);
  doc.save(`${fileName}.pdf`);
}

function fit(doc: { getTextWidth(text: string): number }, value: string, width: number): string {
  if (doc.getTextWidth(value) <= width) return value;
  let text = value;
  while (text.length > 1 && doc.getTextWidth(`${text}…`) > width) text = text.slice(0, -1);
  return `${text}…`;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}
