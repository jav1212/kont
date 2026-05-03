// get-movement-draft.use-case — full hydration of a draft group for the UI
// to rehydrate the form (meta + items).
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import type { MovementDraftGroup } from '../domain/movement-draft';
import { IMovementDraftRepository } from '../domain/repository/movement-draft.repository';

export interface GetMovementDraftInput {
    companyId: string;
    draftGroupId: string;
}

export class GetMovementDraftUseCase
    extends UseCase<GetMovementDraftInput, MovementDraftGroup | null>
{
    constructor(private readonly repo: IMovementDraftRepository) { super(); }

    async execute(input: GetMovementDraftInput): Promise<Result<MovementDraftGroup | null>> {
        if (!input.companyId)    return Result.fail('companyId is required');
        if (!input.draftGroupId) return Result.fail('draftGroupId is required');
        return this.repo.getGroup(input.companyId, input.draftGroupId);
    }
}
