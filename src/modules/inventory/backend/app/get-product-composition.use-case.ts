import { Result } from '@/src/core/domain/result';
import { UseCase } from '@/src/core/domain/use-case';
import { IProductRepository, ProductComposition } from '../domain/repository/product.repository';

export class GetProductCompositionUseCase extends UseCase<{ companyId: string; productId: string }, ProductComposition> {
    /**
     * Creates the query handler.
     * @param repo Product persistence port scoped by the infrastructure adapter.
     */
    constructor(private readonly repo: IProductRepository) { super(); }

    /**
     * Returns the current recipe and sellability state for a catalog product.
     * @param input Company and product identifiers from an authorized request.
     * @returns The resolved recipe or an expected validation failure.
     */
    async execute(input: { companyId: string; productId: string }): Promise<Result<ProductComposition>> {
        if (!input.companyId || !input.productId) return Result.fail('companyId and productId are required');
        return this.repo.getComposition(input.companyId, input.productId);
    }
}
