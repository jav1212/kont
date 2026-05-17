import { Result }                       from "@/src/core/domain/result";
import { IBonificacionesRunRepository } from "../../domain/repository/bonificaciones-run.repository";
import { BonificacionesRun }            from "../../domain/bonificaciones-run";

export class GetBonificacionesRunsUseCase {
    constructor(private readonly repo: IBonificacionesRunRepository) {}

    async execute(companyId: string): Promise<Result<BonificacionesRun[]>> {
        if (!companyId) return Result.fail("companyId es requerido");
        return this.repo.findByCompany(companyId);
    }
}
