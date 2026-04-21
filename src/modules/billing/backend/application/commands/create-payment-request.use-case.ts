// CreatePaymentRequestUseCase — submits a new payment request (comprobante) for a tenant, then emits PaymentRequestCreated.
// Role: application — validates required fields, delegates persistence to the repository.
// Invariant: planId, billingCycle, amountUsd, and paymentMethod are required; status defaults to 'pending'.
// Side-effect: applies available referral credit before persisting; registers redemptions afterwards.

import { UseCase }              from "@/src/core/domain/use-case";
import { Result }               from "@/src/core/domain/result";
import { IEventBus }            from "@/src/core/domain/event-bus";
import { PaymentRequest, BillingCycle, PaymentMethod } from "../../domain/tenant";
import { IBillingRepository, CreatePaymentRequestInput } from "../../domain/billing-repository";
import { PaymentRequestCreatedPayload } from "../../domain/events/payment-request-created.event";
import { GetAvailableCreditUseCase } from "@/src/modules/referrals/backend/application/queries/get-available-credit.use-case";
import { ConsumeCreditsUseCase }     from "@/src/modules/referrals/backend/application/commands/consume-credits.use-case";

interface Input {
    tenantId:      string;
    planId:        string;
    billingCycle:  BillingCycle;
    amountUsd:     number;
    paymentMethod: PaymentMethod;
    receiptUrl:    string | null;
}

export class CreatePaymentRequestUseCase extends UseCase<Input, PaymentRequest> {
    constructor(
        private readonly repo: IBillingRepository,
        private readonly eventBus?: IEventBus,
        private readonly getAvailableCredit?: GetAvailableCreditUseCase,
        private readonly consumeCredits?: ConsumeCreditsUseCase,
    ) {
        super();
    }

    async execute(input: Input): Promise<Result<PaymentRequest>> {
        const { tenantId, ...rest } = input;

        if (!rest.planId || !rest.billingCycle || !rest.amountUsd || !rest.paymentMethod) {
            return Result.fail("planId, billingCycle, amountUsd and paymentMethod are required");
        }

        // 1) Calcular descuento por crédito disponible (si hay use cases inyectados).
        let discountUsd = 0;
        if (this.getAvailableCredit) {
            const availRes = await this.getAvailableCredit.execute({ tenantId });
            if (availRes.isSuccess) {
                const available = availRes.getValue().availableUsd;
                discountUsd = Math.min(available, rest.amountUsd);
                discountUsd = Math.round(discountUsd * 100) / 100;
            }
        }

        const finalAmountUsd = Math.round((rest.amountUsd - discountUsd) * 100) / 100;

        // 2) Caso especial: el crédito cubre el 100% del plan → auto-aprobamos
        //    y activamos el tenant sin exigir comprobante.
        if (finalAmountUsd === 0 && discountUsd > 0) {
            const autoRes = await this.repo.approveAndActivate(tenantId, {
                planId:       rest.planId,
                billingCycle: rest.billingCycle,
                discountUsd,
            });
            if (autoRes.isFailure) return autoRes;
            const created = autoRes.getValue();

            if (this.consumeCredits) {
                const consumeRes = await this.consumeCredits.execute({
                    tenantId,
                    paymentRequestId: created.id,
                    invoiceAmountUsd: discountUsd,
                });
                if (consumeRes.isFailure) {
                    console.error("[billing] consumeCredits failed (auto-approved):", consumeRes.getError());
                }
            }

            if (this.eventBus) {
                await this.eventBus.publish<PaymentRequestCreatedPayload>({
                    eventId:    crypto.randomUUID(),
                    eventType:  "billing.payment_request_created",
                    occurredAt: new Date().toISOString(),
                    payload: {
                        tenantId,
                        planId:        rest.planId,
                        billingCycle:  rest.billingCycle,
                        amountUsd:     0,
                        paymentMethod: "credit",
                    },
                });
            }

            return Result.success(created);
        }

        const payload: CreatePaymentRequestInput = {
            planId:        rest.planId,
            billingCycle:  rest.billingCycle,
            amountUsd:     finalAmountUsd,
            paymentMethod: rest.paymentMethod,
            receiptUrl:    rest.receiptUrl ?? null,
            discountUsd,
        };

        const result = await this.repo.createPaymentRequest(tenantId, payload);
        if (result.isFailure) return result;

        const created = result.getValue();

        // 3) Si se aplicó descuento, registrar las redenciones contra este pago.
        if (discountUsd > 0 && this.consumeCredits) {
            const consumeRes = await this.consumeCredits.execute({
                tenantId,
                paymentRequestId: created.id,
                invoiceAmountUsd: discountUsd,
            });
            if (consumeRes.isFailure) {
                console.error("[billing] consumeCredits failed:", consumeRes.getError());
            }
        }

        if (this.eventBus) {
            await this.eventBus.publish<PaymentRequestCreatedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "billing.payment_request_created",
                occurredAt: new Date().toISOString(),
                payload: {
                    tenantId,
                    planId:        rest.planId,
                    billingCycle:  rest.billingCycle,
                    amountUsd:     finalAmountUsd,
                    paymentMethod: rest.paymentMethod,
                },
            });
        }

        return Result.success(created);
    }
}
