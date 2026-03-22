export type TipoMovimiento =
  | 'entrada' | 'salida'
  | 'entrada_produccion' | 'salida_produccion'
  | 'ajuste_positivo' | 'ajuste_negativo'
  | 'devolucion_entrada' | 'devolucion_salida'
  | 'autoconsumo';

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
  // Multi-moneda (referencia histórica — costo_unitario siempre en Bs)
  moneda?: 'B' | 'D';
  costoMoneda?: number | null;
  tasaDolar?: number | null;
  existenciaActual?: number; // solo para validación de stock, no se persiste
  createdAt?: string;
}

export interface KardexEntry extends Movimiento {
  productoNombre?: string;
}
