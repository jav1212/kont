import { Result } from '@/src/core/domain/result';
import { Proveedor } from '../proveedor';

export interface IProveedorRepository {
  findByEmpresa(empresaId: string): Promise<Result<Proveedor[]>>;
  upsert(proveedor: Proveedor): Promise<Result<Proveedor>>;
  delete(id: string): Promise<Result<void>>;
}
