// Repository interface: ITransformationRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { Transformation } from '../transformation';

export interface ITransformationRepository {
  findByCompany(companyId: string): Promise<Result<Transformation[]>>;
  save(transformation: Transformation): Promise<Result<Transformation>>;
}
