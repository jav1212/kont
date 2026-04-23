// delete-product.use-case — removes a product by id.
// Role: application command handler for the Product domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IProductRepository, DeleteProductOutcome } from '../domain/repository/product.repository';

interface Input { id: string; }

export class DeleteProductUseCase extends UseCase<Input, DeleteProductOutcome> {
    constructor(private readonly repo: IProductRepository) { super(); }

    async execute(input: Input): Promise<Result<DeleteProductOutcome>> {
        if (!input.id) return Result.fail('id is required');
        return this.repo.delete(input.id);
    }
}
