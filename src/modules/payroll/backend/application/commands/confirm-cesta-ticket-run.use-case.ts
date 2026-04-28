// Application layer — validates and persists a cesta ticket run, then emits cesta-ticket.confirmed.
import { Result }                                          from "@/src/core/domain/result";
import { IEventBus }                                       from "@/src/core/domain/event-bus";
import { ICestaTicketRunRepository, SaveCestaTicketRunInput } from "../../domain/repository/cesta-ticket-run.repository";
import { CestaTicketConfirmedPayload }                     from "../../domain/events/cesta-ticket-confirmed.event";

export class ConfirmCestaTicketRunUseCase {
    constructor(
        private readonly repo:      ICestaTicketRunRepository,
        private readonly eventBus?: IEventBus,
    ) {}

    async execute(input: SaveCestaTicketRunInput): Promise<Result<string>> {
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
            if (duplicate) return Result.fail("Ya existe un cesta ticket confirmado para este período.");
        }

        const result = await this.repo.save({
            ...input,
            run: { ...input.run, status: "confirmed" },
        });

        if (result.isSuccess && this.eventBus) {
            const totalUsd = input.receipts.reduce((s, r) => s + r.montoUsd, 0);
            const totalVes = input.receipts.reduce((s, r) => s + r.montoVes, 0);
            await this.eventBus.publish<CestaTicketConfirmedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "cesta-ticket.confirmed",
                occurredAt: new Date().toISOString(),
                payload: {
                    cestaTicketRunId: result.getValue(),
                    companyId:        input.run.companyId,
                    periodStart:      input.run.periodStart,
                    periodEnd:        input.run.periodEnd,
                    employeeCount:    input.receipts.length,
                    totalUsd,
                    totalVes,
                },
            });
        }

        return result;
    }
}
