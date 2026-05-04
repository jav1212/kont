// Domain entity: SalesInvoice
// Represents a customer-facing sales invoice with line items.
// Legal basis: Providencia 0071/2011 (invoice issuance) + PA SNAT/2022/000013
// (IGTF percepción cuando se cobra en divisa/cripto sin mediación financiera).
//
// VatRate, ItemCurrency, InvoiceStatus values are DB contracts.

export type VatRate = 'exenta' | 'reducida_8' | 'general_16';
export type ItemCurrency = 'B' | 'D';
export type AdjustmentKind = 'monto' | 'porcentaje';
export type SalesInvoiceStatus = 'borrador' | 'confirmada' | 'anulada';
export type PaymentTerms = 'contado' | 'credito_15' | 'credito_30' | 'credito_60' | 'credito_90' | 'otro';

/**
 * 7 conceptos del Art. 4 (Reforma IGTF G.O. 6.687) que el agente de
 * percepción reporta en la Forma 99021 quincenal:
 *   - efectivo:    pago en efectivo divisa/cripto
 *   - especies:    pago en especies (oro, otros bienes)
 *   - nota_credito: cancelación con nota de crédito en divisa
 *   - compensacion: compensación de cuentas en divisa
 *   - novacion:    novación de obligaciones
 *   - condonacion: condonación de deuda
 *   - cesion:      cesión de derechos
 */
export type IgtfConcept =
    | 'efectivo'
    | 'especies'
    | 'nota_credito'
    | 'compensacion'
    | 'novacion'
    | 'condonacion'
    | 'cesion';

export const IGTF_CONCEPTS: readonly IgtfConcept[] = [
    'efectivo', 'especies', 'nota_credito', 'compensacion',
    'novacion', 'condonacion', 'cesion',
] as const;

export const IGTF_CONCEPT_LABELS: Record<IgtfConcept, string> = {
    efectivo:     'Efectivo',
    especies:     'Especies',
    nota_credito: 'Nota de crédito',
    compensacion: 'Compensación',
    novacion:     'Novación',
    condonacion:  'Condonación',
    cesion:       'Cesión',
};

export interface SalesInvoiceItem {
    id?:             string;
    invoiceId?:      string;
    /** Optional product link — null for service-only lines. */
    productId?:      string | null;
    productName?:    string;
    /** Free-text description (mandatory; copies product name when productId is set). */
    description:    string;
    quantity:        number;
    /** Unit price in Bs (canonical, net). */
    unitPrice:       number;
    /** qty × unitPrice (gross before adjustments). */
    totalLine:       number;
    vatRate:         VatRate;
    currency:        ItemCurrency;
    currencyPrice?:  number | null;
    dollarRate?:     number | null;

    descuentoTipo?:  AdjustmentKind | null;
    descuentoValor?: number;
    descuentoMonto?: number;
    recargoTipo?:    AdjustmentKind | null;
    recargoValor?:   number;
    recargoMonto?:   number;

    baseIVA?:        number;
    ivaIncluido?:    boolean;
}

export interface SalesInvoice {
    id?:             string;
    companyId:       string;
    customerId:      string;
    customerName?:   string;
    customerRif?:    string;
    customerAddress?:string;

    /** Correlativo legal — auto-asignado al primer save si no se proveyó. */
    invoiceNumber:   string;
    /** N° control (asignado por imprenta autorizada o máquina fiscal). */
    controlNumber?:  string;

    date:            string;       // YYYY-MM-DD
    period:          string;       // YYYY-MM
    periodoManual?:  boolean;

    /** Fecha de vencimiento si es venta a crédito. */
    dueDate?:        string | null;
    /** Condiciones de pago — texto libre o uno de los presets. */
    paymentTerms?:   PaymentTerms | string;

    status:          SalesInvoiceStatus;

    subtotal:        number;
    vatAmount:       number;
    total:           number;
    notes:           string;

    dollarRate?:     number | null;
    rateDecimals?:   number | null;

    descuentoTipo?:  AdjustmentKind | null;
    descuentoValor?: number;
    descuentoMonto?: number;
    recargoTipo?:    AdjustmentKind | null;
    recargoValor?:   number;
    recargoMonto?:   number;

    // ── IGTF Percepción (PA SNAT/2022/000013) ────────────────────────────────
    /** ¿Se cobró en divisa/cripto y aplica IGTF? */
    igtfPerceptionApplies?:     boolean;
    /** Concepto del Art. 4 (efectivo / especies / nota_credito / etc.). */
    igtfPerceptionConcept?:   IgtfConcept | null;
    /** Alícuota — 3% vigente. */
    igtfPerceptionPercentage?: number;
    /** Monto cobrado en divisa (USD/cripto). */
    igtfPerceptionForeignBase?: number;
    /** Base en Bs = baseDivisa × tasaDolar (server-resolved). */
    igtfPerceptionLocalBase?:     number;
    /** Monto IGTF percibido en Bs (server-resolved). */
    igtfPerceptionAmount?:      number;

    confirmedAt?:    string | null;
    items?:          SalesInvoiceItem[];
    createdAt?:      string;
    updatedAt?:      string;
}
