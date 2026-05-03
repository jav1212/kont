// list-latest-movement-draft.use-case — returns the most-recently updated
// draft group for a given company + form kind, or null if none exists.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import type {
    MovementDraftKind,
    MovementDraftSummary,
} from '../domain/movement-draft';
import { IMovementDraftRepository } from '../domain/repository/movement-draft.repository';

export interface ListLatestMovementDraftInput {
    companyId: string;
    kind: MovementDraftKind;
}

export class ListLatestMovementDraftUseCase
    extends UseCase<ListLatestMovementDraftInput, MovementDraftSummary | null>
{
    constructor(private readonly repo: IMovementDraftRepository) { super(); }

    async execute(input: ListLatestMovementDraftInput): Promise<Result<MovementDraftSummary | null>> {
        if (!input.companyId) return Result.fail('companyId is required');
        if (!input.kind)      return Result.fail('kind is required');
        return this.repo.listLatest(input.companyId, input.kind);
    }
}
