// Application layer — persists a cesta ticket run as a draft.
// Drafts are overwritten in-place when the same period already has a draft.
// If a confirmed run exists for the same period, the draft save is rejected.
import { Result }                                          from "@/src/core/domain/result";
import { ICestaTicketRunRepository, SaveCestaTicketRunInput } from "../../domain/repository/cesta-ticket-run.repository";

export class SaveDraftCestaTicketRunUseCase {
    constructor(private readonly repo: ICestaTicketRunRepository) {}

    async execute(input: SaveCestaTicketRunInput): Promise<Result<string>> {
        if (!input.run.companyId)        return Result.fail("companyId is required");
        if (!input.run.periodStart)      return Result.fail("periodStart is required");
        if (!input.run.periodEnd)        return Result.fail("periodEnd is required");
        if (!(input.run.montoUsd > 0))   return Result.fail("montoUsd debe ser mayor a 0");
        if (!(input.run.exchangeRate > 0)) return Result.fail("exchangeRate debe ser mayor a 0");
        if (input.receipts.length === 0) return Result.fail("Se requiere al menos un empleado");

        // Confirmed runs are immutable — never overwrite them with a draft.
        const existing = await this.repo.findByCompany(input.run.companyId);
        if (existing.isSuccess) {
            const confirmed = existing.getValue().find(
                (r) => r.periodStart === input.run.periodStart
                    && r.periodEnd   === input.run.periodEnd
                    && r.status      === "confirmed",
            );
            if (confirmed) {
                return Result.fail("Ya existe un cesta ticket confirmado para este período. No se guardó borrador.");
            }
        }

        return this.repo.save({
            ...input,
            run: { ...input.run, status: "draft" },
        });
    }
}
