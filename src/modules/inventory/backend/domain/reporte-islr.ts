export interface ReporteISLRMovimiento {
  id: string;
  fecha: string;       // YYYY-MM-DD
  referencia: string;
  tipo: string;
  cantEntrada: number;
  cantSalida: number;
  saldoCantidad: number;
  costoEntrada: number;
  costoSalida: number;
  saldoCosto: number;
}

export interface ReporteISLRProducto {
  productoId: string;
  productoCodigo: string;
  productoNombre: string;
  aperturaCantidad: number;
  aperturaCosto: number;
  movimientos: ReporteISLRMovimiento[];
}
