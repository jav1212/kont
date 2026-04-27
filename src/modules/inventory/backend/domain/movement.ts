// Domain entity: Movement (inventory transaction)
// MovementType string literal values are DB enum contracts — do not change.
export type MovementType =
  | 'entrada' | 'salida'
  | 'ajuste_positivo' | 'ajuste_negativo'
  | 'devolucion_entrada' | 'devolucion_salida'
  | 'autoconsumo';

export type MovementAdjustmentKind = 'monto' | 'porcentaje';

export interface Movement {
  id?: string;
  companyId: string;
  productId: string;
  type: MovementType;
  date: string;           // YYYY-MM-DD
  period: string;         // YYYY-MM (siempre derivado de fecha — sin override en manual)
  quantity: number;
  unitCost: number;       // siempre neto en Bs (incluye los ajustes de línea + header)
  totalCost: number;
  balanceQuantity: number;
  reference: string;
  notes: string;
  // Multi-currency (historical reference — unitCost is always in Bs)
  currency?: 'B' | 'D';
  currencyCost?: number | null;
  dollarRate?: number | null;
  currentStock?: number;  // validation only, not persisted

  // ── Ajustes por línea (mig 070) — para movimientos manuales (entradas, ajustes,
  // devoluciones) y heredados de items de factura al confirmar.
  descuentoTipo?:  MovementAdjustmentKind | null;
  descuentoValor?: number;
  descuentoMonto?: number;
  recargoTipo?:    MovementAdjustmentKind | null;
  recargoValor?:   number;
  recargoMonto?:   number;
  baseIVA?:        number;  // base con todos los ajustes pre-IVA (auditoría)

  // ── Precio de venta sin IVA por unidad (sólo aplica a salidas; null en entradas)
  // Persistido por el generador aleatorio de salidas; el reporte de periodo
  // suma `precio_venta_unitario × cantidad` cuando está presente para
  // total_salidas_s_iva_bs (con fallback a costo_total).
  precioVentaUnitario?: number | null;

  createdAt?: string;
}
