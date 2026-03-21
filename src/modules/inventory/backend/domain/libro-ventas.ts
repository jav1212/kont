export interface LibroVentasRow {
  id: string;
  fecha: string;           // YYYY-MM-DD
  numeroFactura: string;
  clienteRif: string;
  clienteNombre: string;
  baseExenta: number;
  baseGravada8: number;
  iva8: number;
  baseGravada16: number;
  iva16: number;
  autoconsumo: number;
  ivaAutoconsumo: number;
  total: number;
  tipo: 'venta' | 'autoconsumo';
}
