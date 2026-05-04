// Domain value object: IslrRetentionExportRow
// Una factura confirmada con retención ISLR > 0, lista para mapear al XML
// genérico (`buildIslrXmlGeneric`) que se sube al portal SENIAT como
// "RelacionRetencionesISLR" mensual (Decreto 1808 + Anexo 6.1).
export interface IslrRetentionExportRow {
    /** Fecha de la operación (factura) en formato ISO 'YYYY-MM-DD'. */
    operationDate:     string;
    /** RIF del proveedor (sujeto retenido). */
    supplierRif:       string;
    /** Nombre del proveedor — sólo para presentación. */
    supplierName:      string;
    /** N° de factura. */
    invoiceNumber:     string;
    /** N° de control. */
    controlNumber:     string;
    /** Código de concepto del Anexo 6.1 (ej. "002", "071", "083"). */
    conceptCode:       string;
    /** Monto base de la operación (Bs). */
    operationAmount:   number;
    /** Alícuota aplicada (%). */
    percentage:        number;
    /** Sustraendo aplicado (Bs); 0 si el concepto no es PNR. */
    sustraendo:        number;
    /** Monto efectivamente retenido (Bs). */
    withheldAmount:    number;
    /** N° de comprobante ISLR (AAAASSSSSSSS — 12 chars). */
    voucherNumber:     string;
}

export interface IslrRetentionExportPayload {
    agentRif:     string;
    periodYyyymm: string;
    rows:         IslrRetentionExportRow[];
}
