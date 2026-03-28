// CreatePaymentRequestUseCase — submits a new payment request (comprobante) for a tenant.
// Role: application — validates required fields, delegates persistence to the repository.
// Invariant: planId, billingCycle, amountUsd, and paymentMethod are required; status defaults to 'pending'.

import { UseCase } from "@/src/core/domain/use-case";
import { Result } from "@/src/core/domain/result";
import { PaymentRequest, BillingCycle, PaymentMethod } from "../../domain/tenant";
import { IBillingRepository, CreatePaymentRequestInput } from "../../domain/billing-repository";

interface Input {
    tenantId:      string;
    planId:        string;
    billingCycle:  BillingCycle;
    amountUsd:     number;
    paymentMethod: PaymentMethod;
    receiptUrl:    string | null;
}

export class CreatePaymentRequestUseCase extends UseCase<Input, PaymentRequest> {
    constructor(private readonly repo: IBillingRepository) {
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

        return this.repo.createPaymentRequest(tenantId, payload);
    }
}
