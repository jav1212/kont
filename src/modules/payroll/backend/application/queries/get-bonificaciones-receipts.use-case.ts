import { Result }                       from "@/src/core/domain/result";
import { IBonificacionesRunRepository } from "../../domain/repository/bonificaciones-run.repository";
import { BonificacionesReceipt }        from "../../domain/bonificaciones-receipt";

export class GetBonificacionesReceiptsUseCase {
    constructor(private readonly repo: IBonificacionesRunRepository) {}

    async execute(runId: string): Promise<Result<BonificacionesReceipt[]>> {
        if (!runId) return Result.fail("runId es requerido");
        return this.repo.findReceiptsByRun(runId);
    }
}
