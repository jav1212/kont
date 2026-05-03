// save-movement-draft.use-case — persists an in-progress movement group.
// Role: application command handler. Uses UPSERT semantics — replaces every
// row in the draft group on each save.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import type {
    MovementDraftSaveInput,
    MovementDraftSaveResult,
} from '../domain/movement-draft';
import { IMovementDraftRepository } from '../domain/repository/movement-draft.repository';

export class SaveMovementDraftUseCase extends UseCase<MovementDraftSaveInput, MovementDraftSaveResult> {
    constructor(private readonly repo: IMovementDraftRepository) { super(); }

    async execute(input: MovementDraftSaveInput): Promise<Result<MovementDraftSaveResult>> {
        if (!input.companyId) return Result.fail('companyId is required');
        if (!input.kind)      return Result.fail('kind is required');
        if (!input.direction) return Result.fail('direction is required');
        return this.repo.save(input);
    }
}
