// CreatePaymentRequestUseCase — submits a new payment request (comprobante) for a tenant, then emits PaymentRequestCreated.
// Role: application — validates required fields, delegates persistence to the repository.
// Invariant: planId, billingCycle, amountUsd, and paymentMethod are required; status defaults to 'pending'.

import { UseCase }              from "@/src/core/domain/use-case";
import { Result }               from "@/src/core/domain/result";
import { IEventBus }            from "@/src/core/domain/event-bus";
import { PaymentRequest, BillingCycle, PaymentMethod } from "../../domain/tenant";
import { IBillingRepository, CreatePaymentRequestInput } from "../../domain/billing-repository";
import { PaymentRequestCreatedPayload } from "../../domain/events/payment-request-created.event";

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
    ) {
        super();
    }

    async execute(input: Input): Promise<Result<PaymentRequest>> {
        const { tenantId, ...rest } = input;

        if (!rest.planId || !rest.billingCycle || !rest.amountUsd || !rest.paymentMethod) {
            return Result.fail("planId, billingCycle, amountUsd and paymentMethod are required");
        }

        const payload: CreatePaymentRequestInput = {
            planId:        rest.planId,
            billingCycle:  rest.billingCycle,
            amountUsd:     rest.amountUsd,
            paymentMethod: rest.paymentMethod,
            receiptUrl:    rest.receiptUrl ?? null,
        };

        const result = await this.repo.createPaymentRequest(tenantId, payload);

        if (result.isSuccess && this.eventBus) {
            await this.eventBus.publish<PaymentRequestCreatedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  "billing.payment_request_created",
                occurredAt: new Date().toISOString(),
                payload: {
                    tenantId,
                    planId:        rest.planId,
                    billingCycle:  rest.billingCycle,
                    amountUsd:     rest.amountUsd,
                    paymentMethod: rest.paymentMethod,
                },
            });
        }

        return result;
    }
}
