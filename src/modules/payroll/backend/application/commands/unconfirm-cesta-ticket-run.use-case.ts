// Application layer — reverts a confirmed cesta ticket run back to draft.
import { Result }                                     from "@/src/core/domain/result";
import { ICestaTicketRunRepository, UnconfirmedRun }  from "../../domain/repository/cesta-ticket-run.repository";

export interface UnconfirmCestaTicketRunInput {
    runId: string;
}

export class UnconfirmCestaTicketRunUseCase {
    constructor(private readonly repo: ICestaTicketRunRepository) {}

    async execute(input: UnconfirmCestaTicketRunInput): Promise<Result<UnconfirmedRun>> {
        if (!input.runId) return Result.fail("runId is required");
        return this.repo.unconfirm(input.runId);
    }
}
