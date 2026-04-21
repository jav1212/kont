// ConsumeCreditsUseCase — aplica los créditos disponibles del tenant a un pago.
// Debe llamarse DESPUÉS de insertar el payment_request (necesita su id).
// Devuelve el descuento aplicado y las redenciones creadas.

import { UseCase } from "@/src/core/domain/use-case";
import { Result }  from "@/src/core/domain/result";
import { IReferralsRepository } from "../../domain/referrals-repository";
import { ReferralRedemption }   from "../../domain/referral-credit";

interface Input {
    tenantId:          string;
    paymentRequestId:  string;
    invoiceAmountUsd:  number;
}

interface Output {
    discountUsd: number;
    redemptions: ReferralRedemption[];
}

export class ConsumeCreditsUseCase extends UseCase<Input, Output> {
    constructor(private readonly repo: IReferralsRepository) { super(); }

    async execute(input: Input): Promise<Result<Output>> {
        if (input.invoiceAmountUsd <= 0) {
            return Result.success({ discountUsd: 0, redemptions: [] });
        }

        const res = await this.repo.consumeCreditsForPayment(input);
        if (res.isFailure) return Result.fail(res.getError());

        return Result.success(res.getValue());
    }
}
