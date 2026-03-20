export type TipoMovimiento =
  | 'entrada_compra' | 'salida_venta'
  | 'entrada_produccion' | 'salida_produccion'
  | 'ajuste_positivo' | 'ajuste_negativo'
  | 'devolucion_compra' | 'devolucion_venta'
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
  // Campos opcionales para salida_venta y autoconsumo
  numeroFacturaVenta?: string | null;
  clienteRif?: string | null;
  clienteNombre?: string | null;
  precioVentaUnitario?: number | null;
  ivaVentaMonto?: number | null;
  existenciaActual?: number; // solo para validación de stock, no se persiste
  createdAt?: string;
}

export interface KardexEntry extends Movimiento {
  productoNombre?: string;
}
