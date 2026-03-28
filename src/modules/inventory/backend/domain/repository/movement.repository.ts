// Repository interface: IMovementRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { Movement, KardexEntry } from '../movement';

export interface IMovementRepository {
  findByCompany(companyId: string, period?: string): Promise<Result<Movement[]>>;
  save(movement: Movement): Promise<Result<Movement>>;
  getKardex(companyId: string, productId: string): Promise<Result<KardexEntry[]>>;
  delete(id: string): Promise<Result<void>>;
  updateMeta(id: string, date: string, reference: string, notes: string): Promise<Result<Movement>>;
}
