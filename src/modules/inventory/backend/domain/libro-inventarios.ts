export interface LibroInventariosRow {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  unidadMedida: string;
  cantInicial: number;
  valorInicial: number;
  cantEntradas: number;
  valorEntradas: number;
  cantSalidas: number;
  valorSalidas: number;
  cantFinal: number;
  valorFinal: number;
  valorCompras: number;
}
