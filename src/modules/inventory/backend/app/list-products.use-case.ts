// list-products.use-case — queries all products for a given company.
// Role: application query handler for the Product domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Product } from '../domain/product';
import { IProductRepository } from '../domain/repository/product.repository';

interface Input { companyId: string; }

export class ListProductsUseCase extends UseCase<Input, Product[]> {
    constructor(private readonly repo: IProductRepository) { super(); }

    async execute(input: Input): Promise<Result<Product[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(input.companyId);
    }
}
