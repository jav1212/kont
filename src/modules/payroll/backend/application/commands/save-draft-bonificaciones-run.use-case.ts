// Application layer — persists a bonificaciones run as a draft.
// Mantenido en paridad con save-draft-bono-guerra-run.use-case.ts.
import { Result }                                                         from "@/src/core/domain/result";
import { IBonificacionesRunRepository, SaveBonificacionesRunInput }       from "../../domain/repository/bonificaciones-run.repository";

export class SaveDraftBonificacionesRunUseCase {
    constructor(private readonly repo: IBonificacionesRunRepository) {}

    async execute(input: SaveBonificacionesRunInput): Promise<Result<string>> {
        if (!input.run.companyId)          return Result.fail("companyId is required");
        if (!input.run.periodStart)        return Result.fail("periodStart is required");
        if (!input.run.periodEnd)          return Result.fail("periodEnd is required");
        if (!(input.run.exchangeRate > 0)) return Result.fail("exchangeRate debe ser mayor a 0");
        if (!(input.run.totalVes >= 0))    return Result.fail("totalVes inválido");
        if (input.receipts.length === 0)   return Result.fail("Se requiere al menos un empleado");
        if (input.receipts.some((r) => r.bonusLines.length === 0))
            return Result.fail("Cada empleado debe tener al menos una línea de bono");

        const existing = await this.repo.findByCompany(input.run.companyId);
        if (existing.isSuccess) {
            const confirmed = existing.getValue().find(
                (r) => r.periodStart === input.run.periodStart
                    && r.periodEnd   === input.run.periodEnd
                    && r.status      === "confirmed",
            );
            if (confirmed) {
                return Result.fail("Ya existe un registro de bonificaciones confirmado para este período. No se guardó borrador.");
            }
        }

        return this.repo.save({
            ...input,
            run: { ...input.run, status: "draft" },
        });
    }
}
