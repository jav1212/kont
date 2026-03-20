import { Result } from '@/src/core/domain/result';
import { Producto } from '../producto';

export interface IProductoRepository {
  findByEmpresa(empresaId: string): Promise<Result<Producto[]>>;
  upsert(producto: Producto): Promise<Result<Producto>>;
  delete(id: string): Promise<Result<void>>;
}
