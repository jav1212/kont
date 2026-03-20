export type TipoMovimiento =
  | 'entrada_compra' | 'salida_venta'
  | 'entrada_produccion' | 'salida_produccion'
  | 'ajuste_positivo' | 'ajuste_negativo'
  | 'devolucion_compra' | 'devolucion_venta';

export interface Movimiento {
  id?: string;
  empresaId: string;
  productoId: string;
  tipo: TipoMovimiento;
  fecha: string;           // YYYY-MM-DD
  periodo: string;         // YYYY-MM
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  saldoCantidad: number;
  referencia: string;
  notas: string;
  transformacionId?: string | null;
  createdAt?: string;
}

export interface KardexEntry extends Movimiento {
  productoNombre?: string;
}
