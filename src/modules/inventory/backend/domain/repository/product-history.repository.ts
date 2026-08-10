import { Result } from '@/src/core/domain/result';
import type { ProductHistory } from '../product-history';

export interface IProductHistoryRepository {
    find(companyId: string, productId: string): Promise<Result<ProductHistory>>;
}
