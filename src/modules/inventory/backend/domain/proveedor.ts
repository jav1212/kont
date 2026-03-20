export interface Proveedor {
  id?: string;
  empresaId: string;
  rif: string;
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
  direccion: string;
  notas: string;
  activo: boolean;
  createdAt?: string;
  updatedAt?: string;
}
