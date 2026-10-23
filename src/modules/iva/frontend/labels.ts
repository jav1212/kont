/** Stable vocabulary values returned by VAT reporting contracts. */
export type IvaLabelKey =
  | "taxed" | "zero_rated" | "exempt" | "exonerated" | "not_subject"
  | "base" | "luxury" | "payment" | "practiced" | "suffered"
  | "eligible" | "ineligible" | "pending_review" | "issue" | "reconciled"
  | "unknown" | "taxable" | "non_subject"
  | "invoice" | "credit_note" | "debit_note" | "return" | "import_declaration" | "foreign_service_assessment" | "adjustment"
  | "legacy_purchase_invoice" | "legacy_purchase_credit_note" | "legacy_purchase_debit_note" | "legacy_sales_invoice" | "legacy_sales_credit_note" | "legacy_delivery_note" | "fiscal_document" | "custom"
  | "purchase_invoice" | "purchase_credit_note" | "purchase_debit_note" | "sales_invoice" | "sales_credit_note" | "unsupported"
  | "missing_control_number" | "invalid_or_future_date" | "note_without_affected_invoice" | "unsupported_document_type" | "unrecognized_line_rate" | "withholding_without_certificate";

const LABELS: Record<IvaLabelKey, string> = {
  taxed: "Gravado", zero_rated: "Tasa cero", exempt: "Exento", exonerated: "Exonerado", not_subject: "No sujeto",
  base: "Alícuota", luxury: "Adicional suntuario", payment: "Adicional por pago en divisas",
  practiced: "Retención practicada", suffered: "Retención soportada",
  eligible: "Admitido", ineligible: "No admitido", pending_review: "Por revisar",
  issue: "Pendiente", reconciled: "Incluido", unknown: "Por clasificar", taxable: "Gravado", non_subject: "No sujeto",
  invoice: "Factura", credit_note: "Nota de crédito", debit_note: "Nota de débito", return: "Devolución", import_declaration: "Declaración de importación", foreign_service_assessment: "Servicio del exterior", adjustment: "Ajuste",
  legacy_purchase_invoice: "Factura de compra heredada", legacy_purchase_credit_note: "Nota de crédito de compra heredada", legacy_purchase_debit_note: "Nota de débito de compra heredada", legacy_sales_invoice: "Factura de venta heredada", legacy_sales_credit_note: "Nota de crédito de venta heredada", legacy_delivery_note: "Nota de entrega heredada", fiscal_document: "Documento fiscal", custom: "Documento revisado",
  purchase_invoice: "Factura de compra", purchase_credit_note: "Nota de crédito de compra", purchase_debit_note: "Nota de débito de compra", sales_invoice: "Factura de venta", sales_credit_note: "Nota de crédito de venta", unsupported: "Tipo no admitido",
  missing_control_number: "Sin número de control", invalid_or_future_date: "Fecha inválida o futura", note_without_affected_invoice: "Nota sin factura afectada", unsupported_document_type: "Tipo de documento no admitido", unrecognized_line_rate: "Alícuota de línea no reconocida", withholding_without_certificate: "Retención sin comprobante",
};

/**
 * Returns the user-facing Spanish label for a VAT domain value.
 * @param key - Stable value returned by a VAT contract.
 * @returns Spanish label suitable for the Web interface.
 */
export function ivaLabel(key: IvaLabelKey): string {
  return LABELS[key];
}

/**
 * Localizes a contract value while keeping unknown future values visibly pending.
 * @param value - Raw value received from a VAT contract.
 * @returns Spanish label or a safe pending label for unknown codes.
 */
export function ivaLabelOrPending(value: string): string {
  return Object.hasOwn(LABELS, value) ? LABELS[value as IvaLabelKey] : "Por revisar";
}
