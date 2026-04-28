// Application layer — retrieves all cesta ticket receipts for a given run.
import { Result }                    from "@/src/core/domain/result";
import { ICestaTicketRunRepository } from "../../domain/repository/cesta-ticket-run.repository";
import { CestaTicketReceipt }        from "../../domain/cesta-ticket-receipt";

export class GetCestaTicketReceiptsUseCase {
    constructor(private readonly repo: ICestaTicketRunRepository) {}

    async execute(runId: string): Promise<Result<CestaTicketReceipt[]>> {
        if (!runId) return Result.fail("runId es requerido");
        return this.repo.findReceiptsByRun(runId);
    }
}
