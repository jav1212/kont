// RefundCreditsForPaymentUseCase — revierte las redenciones de un payment_request
// rechazado/cancelado, restaurando los créditos al estado previo. Idempotente.

import { UseCase } from "@/src/core/domain/use-case";
import { Result }  from "@/src/core/domain/result";
import { IReferralsRepository } from "../../domain/referrals-repository";

interface Input {
    paymentRequestId: string;
}

export class RefundCreditsForPaymentUseCase extends UseCase<Input, void> {
    constructor(private readonly repo: IReferralsRepository) { super(); }

    async execute(input: Input): Promise<Result<void>> {
        if (!input.paymentRequestId) return Result.fail("paymentRequestId is required");
        return this.repo.refundCreditsForPayment(input.paymentRequestId);
    }
}
