// Domain value object: IvaRetentionExportRow
// Una fila del archivo TXT de retenciones IVA exigido por SENIAT
// (Providencia SNAT/2025/000054, vigente 01/08/2025).
//
// Contrato del archivo:
//   * Encoding: ISO-8859-1 (Latin-1), sin BOM
//   * Separador: TAB
//   * Una línea por (factura, alícuota IVA con base > 0). Las facturas
//     multi-tasa generan múltiples líneas, todas con el mismo número de
//     comprobante.
//   * Formato exacto del comprobante: AAAAMMSSSSSSSS — 14 caracteres.
//
// Estructura por línea (17 tokens tab-separados):
//   0: índice secuencial (1, 2, 3…)
//   A: RIF agente (10 chars, sin guiones, ej. "J413075474")
//   B: Período "AAAAMM" (ej. "202604")
//   C: Fecha documento "AAAA-MM-DD"
//   D: Tipo operación "C" (compra) | "V" (venta)
//   E: Tipo documento "01" factura | "02" ND | "03" NC
//   F: RIF proveedor (10 chars)
//   G: Número de factura (hasta 20 chars)
//   H: Número de control (hasta 20 chars; obligatorio sólo en facturas
//      normales — no para exentas/NC/ND/IMP)
//   I: Monto total documento — 13+2 dec, "." decimal, ej. "10625600.00"
//   J: Base imponible
//   K: Monto IVA retenido
//   L: Documento afectado ("0" si factura normal)
//   M: N° de Comprobante de Retención (14 chars AAAAMMSSSSSSSS)
//   N: Monto exento IVA
//   O: Alícuota "NN.NN" (ej. "16.00")
//   P: N° de expediente ("0" si no aplica)
export interface IvaRetentionExportRow {
    /** RIF del agente de retención (la empresa). 10 chars sin guiones. */
    agentRif:        string;
    /** Período "AAAAMM" — derivado del período de la factura. */
    periodYyyymm:    string;
    /** Fecha del documento "AAAA-MM-DD". */
    date:            string;
    /** Tipo de operación: "C" para compras. */
    operationType:   'C' | 'V';
    /** Tipo de documento: "01" factura, "02" nota débito, "03" nota crédito. */
    documentType:    '01' | '02' | '03';
    /** RIF del proveedor — 10 chars sin guiones. */
    supplierRif:     string;
    /** Nombre del proveedor — sólo para presentación, NO va al TXT. */
    supplierName:    string;
    /** N° de factura (hasta 20 chars). */
    invoiceNumber:   string;
    /** N° de control (hasta 20 chars). */
    controlNumber:   string;
    /** Base imponible asociada a la alícuota de esta línea. */
    taxableBase:     number;
    /** Alícuota IVA aplicada en esta línea (8 o 16). */
    vatRate:         number;
    /** Monto del IVA causado para esta alícuota = taxableBase × vatRate/100. */
    vatAmount:       number;
    /** Monto retenido al proveedor en esta línea = vatAmount × retención%/100. */
    vatWithheld:     number;
    /** Monto total de la línea (base + IVA causado). Sólo informativo. */
    lineTotal:       number;
    /** Monto exento IVA de la factura completa (mismo en cada línea). */
    exemptAmount:    number;
    /** N° de Comprobante de Retención IVA — 14 chars AAAAMMSSSSSSSS. */
    voucherNumber:   string;
    /** Documento afectado — "0" si es factura normal. */
    affectedDocument:string;
    /** N° de expediente — "0" si no aplica. */
    fileNumber:      string;
}
