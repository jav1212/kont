import { Result } from '@/src/core/domain/result';
import { LibroInventariosRow } from '../libro-inventarios';

export interface ILibroInventariosRepository {
  getLibroInventarios(empresaId: string, anio: number): Promise<Result<LibroInventariosRow[]>>;
}
