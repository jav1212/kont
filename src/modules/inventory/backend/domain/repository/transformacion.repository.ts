import { Result } from '@/src/core/domain/result';
import { Transformacion } from '../transformacion';

export interface ITransformacionRepository {
  findByEmpresa(empresaId: string): Promise<Result<Transformacion[]>>;
  save(transformacion: Transformacion): Promise<Result<Transformacion>>;
}
