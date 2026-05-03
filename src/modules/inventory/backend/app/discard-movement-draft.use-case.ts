// discard-movement-draft.use-case — wipes a draft group from the tenant
// schema. Used when the user clicks "Descartar" in the resume banner.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IMovementDraftRepository } from '../domain/repository/movement-draft.repository';

export interface DiscardMovementDraftInput {
    companyId: string;
    draftGroupId: string;
}

export class DiscardMovementDraftUseCase
    extends UseCase<DiscardMovementDraftInput, { deleted: number }>
{
    constructor(private readonly repo: IMovementDraftRepository) { super(); }

    async execute(input: DiscardMovementDraftInput): Promise<Result<{ deleted: number }>> {
        if (!input.companyId)    return Result.fail('companyId is required');
        if (!input.draftGroupId) return Result.fail('draftGroupId is required');
        return this.repo.discard(input.companyId, input.draftGroupId);
    }
}
