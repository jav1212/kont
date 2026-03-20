import { Result } from '@/src/core/domain/result';
import { Movimiento, KardexEntry } from '../movimiento';

export interface IMovimientoRepository {
  findByEmpresa(empresaId: string, periodo?: string): Promise<Result<Movimiento[]>>;
  save(movimiento: Movimiento): Promise<Result<Movimiento>>;
  getKardex(empresaId: string, productoId: string): Promise<Result<KardexEntry[]>>;
}
