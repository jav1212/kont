// Domain entity: Movement (inventory transaction / kardex entry)
// MovementType string literal values are DB enum contracts — do not change.
export type MovementType =
  | 'entrada' | 'salida'
  | 'entrada_produccion' | 'salida_produccion'
  | 'ajuste_positivo' | 'ajuste_negativo'
  | 'devolucion_entrada' | 'devolucion_salida'
  | 'autoconsumo';

export interface Movement {
  id?: string;
  companyId: string;
  productId: string;
  type: MovementType;
  date: string;           // YYYY-MM-DD
  period: string;         // YYYY-MM
  quantity: number;
  unitCost: number;
  totalCost: number;
  balanceQuantity: number;
  reference: string;
  notes: string;
  transformationId?: string | null;
  // Multi-currency (historical reference — unitCost is always in Bs)
  currency?: 'B' | 'D';
  currencyCost?: number | null;
  dollarRate?: number | null;
  currentStock?: number;  // validation only, not persisted
  createdAt?: string;
}

export interface KardexEntry extends Movement {
  productName?: string;
}
