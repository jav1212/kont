import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import type { ProductHistory } from '../domain/product-history';
import type { IProductHistoryRepository } from '../domain/repository/product-history.repository';

interface Input { companyId: string; productId: string; }

export class GetProductHistoryUseCase extends UseCase<Input, ProductHistory> {
    constructor(private readonly repo: IProductHistoryRepository) { super(); }

    async execute(input: Input): Promise<Result<ProductHistory>> {
        if (!input.companyId) return Result.fail('companyId is required');
        if (!input.productId) return Result.fail('productId is required');
        return this.repo.find(input.companyId, input.productId);
    }
}
