// Application layer — reverts a confirmed bonificaciones run back to draft.
import { Result }                                      from "@/src/core/domain/result";
import { IBonificacionesRunRepository, UnconfirmedRun } from "../../domain/repository/bonificaciones-run.repository";

export interface UnconfirmBonificacionesRunInput {
    runId: string;
}

export class UnconfirmBonificacionesRunUseCase {
    constructor(private readonly repo: IBonificacionesRunRepository) {}

    async execute(input: UnconfirmBonificacionesRunInput): Promise<Result<UnconfirmedRun>> {
        if (!input.runId) return Result.fail("runId is required");
        return this.repo.unconfirm(input.runId);
    }
}
