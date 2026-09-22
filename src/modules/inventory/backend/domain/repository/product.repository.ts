// Repository interface: IProductRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { Product, ProductComponent, ProductCompositionKind } from '../product';

export interface DeleteProductOutcome {
  softDeleted: boolean;
}

export interface ProductComposition {
  productId: string;
  companyId: string;
  compositionKind: ProductCompositionKind;
  compositionStatus: 'pending' | 'ready';
  components: ProductComponent[];
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
  /**
   * Returns a product recipe with each component resolved from the owning company.
   * @param companyId Company scope for the lookup.
   * @param productId Composite or simple catalog product identifier.
   * @returns The current recipe and its sellability state.
   */
  getComposition(companyId: string, productId: string): Promise<Result<ProductComposition>>;
  /**
   * Atomically replaces every component of a composite product.
   * @param companyId Company scope for both parent and components.
   * @param productId Composite catalog product identifier.
   * @param components Complete replacement list with positive quantities.
   * @returns The persisted, resolved recipe.
   */
  replaceComposition(companyId: string, productId: string, components: Array<Pick<ProductComponent, 'productId' | 'quantity'>>): Promise<Result<ProductComposition>>;
}
