// Application layer — validates and persists a bono de guerra run, then emits bono-guerra.confirmed.
import { Result }                                          from "@/src/core/domain/result";
import { IEventBus }                                       from "@/src/core/domain/event-bus";
import { IBonoGuerraRunRepository, SaveBonoGuerraRunInput } from "../../domain/repository/bono-guerra-run.repository";
import { BonoGuerraConfirmedPayload }                       from "../../domain/events/bono-guerra-confirmed.event";

export class ConfirmBonoGuerraRunUseCase {
    constructor(
        private readonly repo:      IBonoGuerraRunRepository,
        private readonly eventBus?: IEventBus,
    ) {}

    async execute(input: SaveBonoGuerraRunInput): Promise<Result<string>> {
        if (!input.run.companyId)        return Result.fail("companyId is required");
        if (!input.run.periodStart)      return Result.fail("periodStart is required");
        if (!input.run.periodEnd)        return Result.fail("periodEnd is required");
        if (!(input.run.montoUsd > 0))   return Result.fail("montoUsd debe ser mayor a 0");
        if (!(input.run.exchangeRate > 0)) return Result.fail("exchangeRate debe ser mayor a 0");
        if (input.receipts.length === 0) return Result.fail("Se requiere al menos un empleado");

        // Drafts for the same period are promoted in-place by the RPC; only an
        // already-confirmed run for the same period is a hard duplicate.
        const existing = await this.repo.findByCompany(input.run.companyId);
        if (existing.isSuccess) {
            const duplicate = existing.getValue().find(
                (r) => r.periodStart === input.run.periodStart
                    && r.periodEnd   === input.run.periodEnd
                    && r.status      === "confirmed",
            );
            if (duplicate) return Result.fail("Ya existe un bono de guerra confirmado para este período.");
        }

        const result = await this.repo.save({
            ...input,
            run: { ...input.run, status: "confirmed" },
        });

        if (result.isSuccess && this.eventBus) {
            const totalUsd = input.receipts.reduce((s, r) => s + r.montoUsd, 0);
            const totalVes = input.receipts.reduce((s, r) => s + r.montoVes, 0);
            await this.eventBus.publish<BonoGuerraConfirmedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "bono-guerra.confirmed",
                occurredAt: new Date().toISOString(),
                payload: {
                    bonoGuerraRunId: result.getValue(),
                    companyId:       input.run.companyId,
                    periodStart:     input.run.periodStart,
                    periodEnd:       input.run.periodEnd,
                    employeeCount:   input.receipts.length,
                    totalUsd,
                    totalVes,
                },
            });
        }

        return result;
    }
}
