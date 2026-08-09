// save-product.use-case — creates or updates a product.
// Role: application command handler for the Product domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Product } from '../domain/product';
import { IProductRepository } from '../domain/repository/product.repository';

export class SaveProductUseCase extends UseCase<Product, Product> {
    constructor(private readonly repo: IProductRepository) { super(); }

    async execute(product: Product): Promise<Result<Product>> {
        if (!product.name?.trim()) return Result.fail('Product name is required');
        if (!product.companyId) return Result.fail('companyId is required');
        if (product.salePricing) {
            const value = product.salePricing.mode === 'fixed'
                ? product.salePricing.amount
                : product.salePricing.percentage;
            if (!Number.isFinite(value) || value < 0) return Result.fail('Sale price must be a non-negative number');
            if (product.salePricing.mode === 'fixed' && value === 0) return Result.fail('Fixed sale price must be greater than zero');
        }
        return this.repo.upsert(product);
    }
}
