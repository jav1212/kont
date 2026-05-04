// Domain entity: PurchaseInvoice
// Represents a supplier purchase invoice with line items.
// VatRate, ItemCurrency, InvoiceStatus string literal values are DB contracts — do not change.
export type VatRate = 'exenta' | 'reducida_8' | 'general_16';
export type ItemCurrency = 'B' | 'D';
export type AdjustmentKind = 'monto' | 'porcentaje';

export interface PurchaseInvoiceItem {
  id?: string;
  invoiceId?: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitCost: number;    // always in Bs (canonical) — siempre neto, sin IVA
  totalCost: number;   // qty × unitCost, antes de ajustes
  vatRate: VatRate;
  currency: ItemCurrency;    // original currency of the supplier invoice
  currencyCost?: number | null; // cost in original currency (USD if currency='D')
  dollarRate?: number | null;   // BCV rate used for conversion

  // ── Ajustes por línea (descuento, recargo)
  // Cada uno por monto Bs o porcentaje.
  descuentoTipo?:  AdjustmentKind | null;
  descuentoValor?: number;
  descuentoMonto?: number;     // resuelto en Bs (sólo línea, sin spread del header)
  recargoTipo?:    AdjustmentKind | null;
  recargoValor?:   number;
  recargoMonto?:   number;     // resuelto en Bs

  // Base IVA final (incluye ajustes de línea + spread proporcional del header)
  baseIVA?: number;

  // Toggle de UI: el costo_unitario fue ingresado con IVA incluido — el form
  // ya convirtió a neto antes de persistir. Se guarda para restaurar el modo
  // de entrada en re-edit.
  ivaIncluido?: boolean;
}

export type InvoiceStatus = 'borrador' | 'confirmada';

export interface PurchaseInvoice {
  id?: string;
  companyId: string;
  supplierId: string;
  supplierName?: string;
  invoiceNumber: string;
  controlNumber?: string;
  date: string;       // YYYY-MM-DD — drives BCV lookup
  period: string;     // YYYY-MM — período contable (puede diferir del mes de fecha)
  status: InvoiceStatus;
  subtotal: number;
  vatPercentage: number;
  vatAmount: number;
  total: number;
  notes: string;
  /**
   * Header-level BCV rate the user locked in for this invoice — drives the
   * USD→Bs conversion for every `currency='D'` line item. Nullable for legacy
   * invoices saved before migration 068 and for all-Bs invoices.
   */
  dollarRate?: number | null;
  /**
   * Decimal precision the user chose for the BCV rate. Persisted so the edit
   * modal can restore the exact display (e.g. `414.0500` vs `414.05`) when
   * the accountant reopens the invoice. Nullable for legacy invoices.
   */
  rateDecimals?: number | null;

  // ── Override de período contable (mig 070)
  // Cuando true, `period` es el elegido por el usuario; si false, se sigue
  // derivando de `date` en el RPC.
  periodoManual?: boolean;

  // ── Ajustes a nivel encabezado (mig 070) — se prorratean proporcional pre-IVA
  descuentoTipo?:  AdjustmentKind | null;
  descuentoValor?: number;
  descuentoMonto?: number;     // resuelto en Bs
  recargoTipo?:    AdjustmentKind | null;
  recargoValor?:   number;
  recargoMonto?:   number;

  // ── Retención IVA (mig 080) — descuento POST-IVA. No toca base ni IVA débito;
  // el monto retenido se entera a SENIAT, no al proveedor. Aplica a TODA la
  // factura (sin discriminar alícuota). Defaults: 0 / 75 / 100.
  retencionIvaPct?:   number;  // 0 | 75 | 100
  retencionIvaMonto?: number;  // server-resolved Bs (= ivaMonto × pct/100)

  /**
   * N° del Comprobante de Retención IVA (mig 090). Asignado server-side al
   * confirmar la factura cuando hay retención. Formato AAAAMMSSSSSSSS — 14
   * chars: AAAAMM del período + correlativo de 8 dígitos que reinicia cada
   * período por empresa. Persistente — no se borra al desconfirmar.
   */
  comprobanteRetencionIvaNumero?: string | null;

  // ── Retención ISLR (mig 091) — Decreto 1808 + Anexo 6.1 SENIAT.
  // El usuario selecciona un concepto del catálogo, define la base y el % se
  // resuelve del concepto. El sustraendo y el monto final los calcula el
  // server (auth) usando computeIslrRetention. Persiste el comprobante ISLR
  // (correlativo anual por empresa) para el XML mensual y el PDF.
  /** Código del concepto ISLR (3 chars, ej. "002"). */
  islrConcepto?:        string | null;
  /** Alícuota aplicada (%); copia del concepto al persistir. */
  islrPorcentaje?:      number;
  /** Base imponible para la retención ISLR (Bs). */
  islrBaseRetencion?:   number;
  /** Sustraendo aplicado (Bs); 0 si el concepto no aplica fórmula PNR. */
  islrSustraendo?:      number;
  /** Monto retenido en Bs (server-resolved). */
  islrMonto?:           number;
  /** Valor de la U.T. usado para el cálculo (Bs); persistido para auditoría. */
  islrUnidadTributaria?: number;
  /**
   * N° de Comprobante de Retención ISLR. Formato AAAASSSSSSSS — 12 chars:
   * AAAA del año fiscal + correlativo de 8 dígitos que reinicia cada año
   * por empresa. (Convención común venezolana — el manual SENIAT no fija
   * formato estricto para ISLR, sólo exige numeración consecutiva en Art.
   * 24 Decreto 1808.)
   */
  comprobanteIslrNumero?: string | null;

  confirmedAt?: string | null;
  items?: PurchaseInvoiceItem[];
  createdAt?: string;
  updatedAt?: string;
}
