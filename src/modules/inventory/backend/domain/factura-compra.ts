export interface FacturaCompraItem {
  id?: string;
  facturaId?: string;
  productoId: string;
  productoNombre?: string;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
}

export type EstadoFactura = 'borrador' | 'confirmada';

export interface FacturaCompra {
  id?: string;
  empresaId: string;
  proveedorId: string;
  proveedorNombre?: string;
  numeroFactura: string;
  fecha: string;       // YYYY-MM-DD
  periodo: string;     // YYYY-MM
  estado: EstadoFactura;
  subtotal: number;
  ivaPorcentaje: number;
  ivaMonto: number;
  total: number;
  notas: string;
  confirmadaAt?: string | null;
  items?: FacturaCompraItem[];
  createdAt?: string;
  updatedAt?: string;
}
