import { encodeVatRetentionTxtLatin1 } from "@kontave/tax-reporting/vat-retention-txt";

/**
 * Starts a browser download for a VAT retention export already built by the package.
 * @param content - Package-rendered text payload.
 * @param filename - Filename chosen by the package export contract.
 * @returns Nothing; the browser receives a temporary object URL download.
 */
export function downloadIvaRetentionTxt(content: string, filename: string): void {
  const blob = new Blob([encodeVatRetentionTxtLatin1(content)], { type: "text/plain;charset=ISO-8859-1" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
