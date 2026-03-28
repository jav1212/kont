// Repository interface: IDepartmentRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { Department } from '../department';

export interface IDepartmentRepository {
  findByCompany(companyId: string): Promise<Result<Department[]>>;
  upsert(department: Department): Promise<Result<Department>>;
  delete(id: string): Promise<Result<void>>;
}
