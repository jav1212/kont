// Application layer — reverts a confirmed bono de guerra run back to draft.
import { Result }                                   from "@/src/core/domain/result";
import { IBonoGuerraRunRepository, UnconfirmedRun } from "../../domain/repository/bono-guerra-run.repository";

export interface UnconfirmBonoGuerraRunInput {
    runId: string;
}

export class UnconfirmBonoGuerraRunUseCase {
    constructor(private readonly repo: IBonoGuerraRunRepository) {}

    async execute(input: UnconfirmBonoGuerraRunInput): Promise<Result<UnconfirmedRun>> {
        if (!input.runId) return Result.fail("runId is required");
        return this.repo.unconfirm(input.runId);
    }
}
