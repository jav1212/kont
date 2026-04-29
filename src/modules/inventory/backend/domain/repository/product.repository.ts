// Repository interface: IProductRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { Product } from '../product';

export interface DeleteProductOutcome {
  softDeleted: boolean;
}

export interface IProductRepository {
  findByCompany(companyId: string): Promise<Result<Product[]>>;
  upsert(product: Product): Promise<Result<Product>>;
  delete(id: string): Promise<Result<DeleteProductOutcome>>;
  /**
   * Resets `existencia_actual` directly without creating a kardex movement.
   * Used by the stock-adjustment generator. Does not modify averageCost.
   */
  setStock(companyId: string, productId: string, newStock: number): Promise<Result<Product>>;
}
