export interface TransformacionConsumo {
  productoId: string;
  cantidad: number;
  costoUnitario: number;
}

export interface Transformacion {
  id?: string;
  empresaId: string;
  descripcion: string;
  fecha: string;
  periodo: string;
  productoTerminadoId: string | null;
  cantidadProducida: number;
  notas: string;
  consumos?: TransformacionConsumo[];
  createdAt?: string;
}

export interface Cierre {
  id?: string;
  empresaId: string;
  periodo: string;
  cerradoAt?: string;
  notas: string;
  tasaDolar?: number | null;
}
