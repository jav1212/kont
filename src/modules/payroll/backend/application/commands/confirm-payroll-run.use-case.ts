// Application layer — validates and persists a payroll run, then emits PayrollConfirmed.
import { Result }                              from "@/src/core/domain/result";
import { IEventBus }                           from "@/src/core/domain/event-bus";
import { IPayrollRunRepository, SavePayrollRunInput } from "../../domain/repository/payroll-run.repository";
import { PayrollConfirmedPayload }             from "../../domain/events/payroll-confirmed.event";

export class ConfirmPayrollRunUseCase {
    constructor(
        private readonly repo:     IPayrollRunRepository,
        private readonly eventBus?: IEventBus,
    ) {}

    async execute(input: SavePayrollRunInput): Promise<Result<string>> {
        if (!input.run.companyId)        return Result.fail("companyId is required");
        if (!input.run.periodStart)      return Result.fail("periodStart is required");
        if (!input.run.periodEnd)        return Result.fail("periodEnd is required");
        if (input.receipts.length === 0) return Result.fail("No employees to confirm");

        // Drafts for the same period are promoted in-place by the RPC; only an
        // already-confirmed run for the same period is a hard duplicate.
        const existing = await this.repo.findByCompany(input.run.companyId);
        if (existing.isSuccess) {
            const duplicate = existing.getValue().find(
                (r) => r.periodStart === input.run.periodStart
                    && r.periodEnd   === input.run.periodEnd
                    && r.status      === "confirmed"
            );
            if (duplicate) return Result.fail("A payroll run already exists for this period.");
        }

        const result = await this.repo.save({
            ...input,
            run: { ...input.run, status: "confirmed" },
        });

        if (result.isSuccess && this.eventBus) {
            await this.eventBus.publish<PayrollConfirmedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "payroll.confirmed",
                occurredAt: new Date().toISOString(),
                payload: {
                    payrollRunId:  result.getValue(),
                    companyId:     input.run.companyId,
                    periodStart:   input.run.periodStart,
                    periodEnd:     input.run.periodEnd,
                    employeeCount: input.receipts.length,
                },
            });
        }

        return result;
    }
}
