// Application layer — retrieves all cesta ticket runs for a given company.
import { Result }                    from "@/src/core/domain/result";
import { ICestaTicketRunRepository } from "../../domain/repository/cesta-ticket-run.repository";
import { CestaTicketRun }            from "../../domain/cesta-ticket-run";

export class GetCestaTicketRunsUseCase {
    constructor(private readonly repo: ICestaTicketRunRepository) {}

    async execute(companyId: string): Promise<Result<CestaTicketRun[]>> {
        if (!companyId) return Result.fail("companyId es requerido");
        return this.repo.findByCompany(companyId);
    }
}
