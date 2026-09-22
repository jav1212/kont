import { Result } from '@/src/core/domain/result';
import { UseCase } from '@/src/core/domain/use-case';
import { IProductRepository, ProductComposition } from '../domain/repository/product.repository';

type Input = { companyId: string; productId: string; components: Array<{ productId: string; quantity: number }> };

export class ReplaceProductCompositionUseCase extends UseCase<Input, ProductComposition> {
    /**
     * Creates the command handler.
     * @param repo Product persistence port that atomically replaces recipes.
     */
    constructor(private readonly repo: IProductRepository) { super(); }

    /**
     * Validates a complete recipe before replacing the product's current recipe.
     * @param input Authorized company/product context and the replacement components.
     * @returns The persisted recipe or an expected validation failure.
     */
    async execute(input: Input): Promise<Result<ProductComposition>> {
        if (!input.companyId || !input.productId) return Result.fail('companyId and productId are required');
        if (!Array.isArray(input.components)) return Result.fail('components must be an array');
        if (input.components.some((component) => !component || !component.productId || !Number.isFinite(component.quantity) || component.quantity <= 0)) {
            return Result.fail('Each component requires a productId and a positive quantity');
        }
        if (new Set(input.components.map((component) => component.productId)).size !== input.components.length) {
            return Result.fail('A product can only appear once in a composition');
        }
        return this.repo.replaceComposition(input.companyId, input.productId, input.components);
    }
}
