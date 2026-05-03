// Repository interface: IMovementDraftRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import type {
    MovementDraftConfirmResult,
    MovementDraftGroup,
    MovementDraftKind,
    MovementDraftSaveInput,
    MovementDraftSaveResult,
    MovementDraftSummary,
} from '../movement-draft';

export interface IMovementDraftRepository {
    save(input: MovementDraftSaveInput): Promise<Result<MovementDraftSaveResult>>;
    confirm(companyId: string, draftGroupId: string): Promise<Result<MovementDraftConfirmResult>>;
    listLatest(companyId: string, kind: MovementDraftKind): Promise<Result<MovementDraftSummary | null>>;
    getGroup(companyId: string, draftGroupId: string): Promise<Result<MovementDraftGroup | null>>;
    discard(companyId: string, draftGroupId: string): Promise<Result<{ deleted: number }>>;
}
