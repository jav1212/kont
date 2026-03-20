export interface LibroVentasRow {
  id: string;
  fecha: string;           // YYYY-MM-DD
  numeroFactura: string;
  clienteRif: string;
  clienteNombre: string;
  baseGravada: number;
  ivaDebito: number;
  baseExenta: number;
  autoconsumo: number;
  ivaAutoconsumo: number;
  total: number;
  tipo: 'venta' | 'autoconsumo';
}
