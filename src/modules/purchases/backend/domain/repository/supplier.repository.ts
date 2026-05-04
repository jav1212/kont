// Repository interface: ISupplierRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { Supplier } from '../supplier';

export interface ISupplierRepository {
  findByCompany(companyId: string): Promise<Result<Supplier[]>>;
  upsert(supplier: Supplier): Promise<Result<Supplier>>;
  delete(id: string): Promise<Result<void>>;
}
