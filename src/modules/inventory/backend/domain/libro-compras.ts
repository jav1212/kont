export interface LibroComprasRow {
  id: string;
  fecha: string;          // YYYY-MM-DD
  numeroFactura: string;
  numeroControl: string;
  proveedorRif: string;
  proveedorNombre: string;
  baseGravada: number;
  ivaGeneral: number;
  baseExenta: number;
  total: number;
}
