// Application layer — retrieves all bono de guerra runs for a given company.
import { Result }                   from "@/src/core/domain/result";
import { IBonoGuerraRunRepository } from "../../domain/repository/bono-guerra-run.repository";
import { BonoGuerraRun }            from "../../domain/bono-guerra-run";

export class GetBonoGuerraRunsUseCase {
    constructor(private readonly repo: IBonoGuerraRunRepository) {}

    async execute(companyId: string): Promise<Result<BonoGuerraRun[]>> {
        if (!companyId) return Result.fail("companyId es requerido");
        return this.repo.findByCompany(companyId);
    }
}
