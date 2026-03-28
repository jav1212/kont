// update-movement-meta.use-case — updates editable metadata (date, reference, notes) of an existing movement.
// Role: application command handler for the Movement domain slice.
// Invariant: only metadata fields are mutable after creation; quantity and costs are immutable.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Movement } from '../domain/movement';
import { IMovementRepository } from '../domain/repository/movement.repository';

interface Input { id: string; date: string; reference: string; notes: string; }

export class UpdateMovementMetaUseCase extends UseCase<Input, Movement> {
    constructor(private readonly repo: IMovementRepository) { super(); }

    async execute(input: Input): Promise<Result<Movement>> {
        if (!input.id) return Result.fail('id is required');
        if (!input.date) return Result.fail('date is required');
        return this.repo.updateMeta(input.id, input.date, input.reference ?? '', input.notes ?? '');
    }
}
