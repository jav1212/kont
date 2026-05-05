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

  // ── IGTF (mig 093) — Reforma G.O. 6.687 (25/02/2022) + PA SNAT/2022/000013.
  // Pagos en divisa o cripto. Para el SPE comprador es informativo (gasto no
  // deducible Art. 18 LIGTF) — el banco/proveedor lo entera al SENIAT. Se
  // suma al `total` porque el proveedor lo carga como concepto adicional al
  // monto desembolsado.
  /** ¿La factura tiene IGTF cargado? */
  igtfAplica?:     boolean;
  /** Alícuota aplicada (%); 3% en divisas/cripto. */
  igtfPorcentaje?: number;
  /** Monto pagado en divisa (USD/cripto). */
  igtfBaseDivisa?: number;
  /** Base en Bolívares = baseDivisa × tasaDolar. */
  igtfBaseBs?:     number;
  /** Monto IGTF en Bs (server-resolved). */
  igtfMonto?:      number;

  confirmedAt?: string | null;
  items?: PurchaseInvoiceItem[];
  /**
   * Cantidad de items asociados a la factura en la base de datos. Se devuelve
   * sólo en el listado (`tenant_inventario_facturas_get`) para permitir que el
   * frontend filtre facturas pendientes de imputar sin tener que cargar el
   * array completo. En el detalle (`tenant_inventario_factura_get`) viene
   * `items` y este campo no se setea.
   */
  itemsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ── Derived predicates ──────────────────────────────────────────────────────
// Una factura "pendiente de imputar" es la que ya cerró contablemente (status =
// confirmada) pero todavía no tiene detalle de productos cargado. Es el caso
// del flujo rápido: contadora registra header + total para cuadrar el libro de
// compras y el asiento; el asistente de inventario imputa los items después.
export function isPendingImputation(invoice: PurchaseInvoice): boolean {
  if (invoice.status !== 'confirmada') return false;
  // En el listado, el repo expone `itemsCount` aunque `items` venga undefined.
  // En el detalle, viene `items` (array). Ambos casos cubiertos.
  if (typeof invoice.itemsCount === 'number') return invoice.itemsCount === 0;
  return (invoice.items?.length ?? 0) === 0;
}

// Suma los `totalCost` de los items (antes de ajustes y retenciones). Útil
// para comparar contra `total` del header en la UI de imputación y avisar al
// usuario si los items no cuadran con el monto declarado.
export function totalItemsAmount(invoice: PurchaseInvoice): number {
  return (invoice.items ?? []).reduce((acc, it) => acc + (it.totalCost ?? 0), 0);
}
