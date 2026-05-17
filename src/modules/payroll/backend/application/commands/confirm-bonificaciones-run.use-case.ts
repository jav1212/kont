// Application layer — validates and persists a bonificaciones run, then emits bonificaciones.confirmed.
import { Result }                                                          from "@/src/core/domain/result";
import { IEventBus }                                                       from "@/src/core/domain/event-bus";
import { IBonificacionesRunRepository, SaveBonificacionesRunInput }        from "../../domain/repository/bonificaciones-run.repository";
import { BonificacionesConfirmedPayload }                                  from "../../domain/events/bonificaciones-confirmed.event";

export class ConfirmBonificacionesRunUseCase {
    constructor(
        private readonly repo:      IBonificacionesRunRepository,
        private readonly eventBus?: IEventBus,
    ) {}

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
            const duplicate = existing.getValue().find(
                (r) => r.periodStart === input.run.periodStart
                    && r.periodEnd   === input.run.periodEnd
                    && r.status      === "confirmed",
            );
            if (duplicate) return Result.fail("Ya existe un registro de bonificaciones confirmado para este período.");
        }

        const result = await this.repo.save({
            ...input,
            run: { ...input.run, status: "confirmed" },
        });

        if (result.isSuccess && this.eventBus) {
            await this.eventBus.publish<BonificacionesConfirmedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "bonificaciones.confirmed",
                occurredAt: new Date().toISOString(),
                payload: {
                    bonificacionesRunId: result.getValue(),
                    companyId:           input.run.companyId,
                    periodStart:         input.run.periodStart,
                    periodEnd:           input.run.periodEnd,
                    employeeCount:       input.run.employeeCount,
                    lineCount:           input.run.lineCount,
                    totalVes:            input.run.totalVes,
                },
            });
        }

        return result;
    }
}
