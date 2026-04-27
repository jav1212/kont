// Repository interface: IMovementRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { Movement } from '../movement';

export interface IMovementRepository {
  findByCompany(companyId: string, period?: string): Promise<Result<Movement[]>>;
  save(movement: Movement): Promise<Result<Movement>>;
  delete(id: string): Promise<Result<void>>;
  updateMeta(id: string, date: string, reference: string, notes: string): Promise<Result<Movement>>;
  // Suma del costo_total de movimientos de entrada del periodo (Bs) para el companyId.
  // Usado por el generador aleatorio de salidas para calcular el target a partir del % de margen.
  getInboundTotal(companyId: string, period: string): Promise<Result<number>>;
}
