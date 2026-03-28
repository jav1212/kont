// delete-movement.use-case — removes a movement by id.
// Role: application command handler for the Movement domain slice.
// Input is a plain string id (not an object) to mirror the legacy API contract.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IMovementRepository } from '../domain/repository/movement.repository';

export class DeleteMovementUseCase extends UseCase<string, void> {
    constructor(private readonly repo: IMovementRepository) { super(); }

    async execute(id: string): Promise<Result<void>> {
        if (!id) return Result.fail('id is required');
        return this.repo.delete(id);
    }
}
