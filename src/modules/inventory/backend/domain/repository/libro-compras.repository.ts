import { Result } from '@/src/core/domain/result';
import { LibroComprasRow } from '../libro-compras';

export interface ILibroComprasRepository {
  getLibroCompras(empresaId: string, periodo: string): Promise<Result<LibroComprasRow[]>>;
}
