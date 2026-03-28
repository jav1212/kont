// get-kardex.use-case — retrieves the full kardex (movement history) for a specific product.
// Role: application query handler for the Movement domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { KardexEntry } from '../domain/movement';
import { IMovementRepository } from '../domain/repository/movement.repository';

interface Input { companyId: string; productId: string; }

export class GetKardexUseCase extends UseCase<Input, KardexEntry[]> {
    constructor(private readonly repo: IMovementRepository) { super(); }

    async execute(input: Input): Promise<Result<KardexEntry[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        if (!input.productId) return Result.fail('productId is required');
        return this.repo.getKardex(input.companyId, input.productId);
    }
}
