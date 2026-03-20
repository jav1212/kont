import { Result } from '@/src/core/domain/result';
import { Departamento } from '../departamento';

export interface IDepartamentoRepository {
  findByEmpresa(empresaId: string): Promise<Result<Departamento[]>>;
  upsert(departamento: Departamento): Promise<Result<Departamento>>;
  delete(id: string): Promise<Result<void>>;
}
