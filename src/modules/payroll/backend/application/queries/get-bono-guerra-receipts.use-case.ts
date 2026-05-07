// Application layer — retrieves all bono de guerra receipts for a given run.
import { Result }                   from "@/src/core/domain/result";
import { IBonoGuerraRunRepository } from "../../domain/repository/bono-guerra-run.repository";
import { BonoGuerraReceipt }        from "../../domain/bono-guerra-receipt";

export class GetBonoGuerraReceiptsUseCase {
    constructor(private readonly repo: IBonoGuerraRunRepository) {}

    async execute(runId: string): Promise<Result<BonoGuerraReceipt[]>> {
        if (!runId) return Result.fail("runId es requerido");
        return this.repo.findReceiptsByRun(runId);
    }
}
