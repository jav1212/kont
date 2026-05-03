// confirm-movement-draft.use-case — promotes every row in a draft group to
// a confirmed inventory movement. The repository delegates to the existing
// `tenant_inventario_movimientos_save` RPC so COGS, costo_promedio, and
// existencia_actual stay in sync.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import type { MovementDraftConfirmResult } from '../domain/movement-draft';
import { IMovementDraftRepository } from '../domain/repository/movement-draft.repository';

export interface ConfirmMovementDraftInput {
    companyId: string;
    draftGroupId: string;
}

export class ConfirmMovementDraftUseCase extends UseCase<ConfirmMovementDraftInput, MovementDraftConfirmResult> {
    constructor(private readonly repo: IMovementDraftRepository) { super(); }

    async execute(input: ConfirmMovementDraftInput): Promise<Result<MovementDraftConfirmResult>> {
        if (!input.companyId)    return Result.fail('companyId is required');
        if (!input.draftGroupId) return Result.fail('draftGroupId is required');
        return this.repo.confirm(input.companyId, input.draftGroupId);
    }
}
