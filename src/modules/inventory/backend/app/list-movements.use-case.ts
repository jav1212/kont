// list-movements.use-case — queries movements for a company, optionally filtered by period.
// Role: application query handler for the Movement domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Movement } from '../domain/movement';
import { IMovementRepository } from '../domain/repository/movement.repository';

interface Input { companyId: string; period?: string; }

export class ListMovementsUseCase extends UseCase<Input, Movement[]> {
    constructor(private readonly repo: IMovementRepository) { super(); }

    async execute(input: Input): Promise<Result<Movement[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(input.companyId, input.period);
    }
}
