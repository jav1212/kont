export interface LibroComprasRow {
  id: string;
  fecha: string;          // YYYY-MM-DD
  numeroFactura: string;
  numeroControl: string;
  proveedorRif: string;
  proveedorNombre: string;
  baseExenta: number;
  baseGravada8: number;
  iva8: number;
  baseGravada16: number;
  iva16: number;
  total: number;
}
