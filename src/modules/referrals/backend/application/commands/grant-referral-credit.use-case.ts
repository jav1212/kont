// GrantReferralCreditUseCase — emite el crédito del referidor cuando el referido
// realiza su primer pago aprobado.
// Se asume que el caller verificó que el pago fue aprobado. La detección del
// "primer pago" se hace con el flag isFirstPayment (calculado antes de marcar
// la fila del tenant como pagada).

import { UseCase } from "@/src/core/domain/use-case";
import { Result }  from "@/src/core/domain/result";
import { IReferralsRepository } from "../../domain/referrals-repository";
import { REFERRAL_PERCENT }     from "../../domain/referral-constants";
import { ReferralCredit }       from "../../domain/referral-credit";

interface Input {
    referredTenantId:       string;
    sourcePaymentRequestId: string;
    paidAmountUsd:          number;
    isFirstPayment:         boolean;
}

interface Output {
    credit: ReferralCredit | null;
    reason?: string;
}

export class GrantReferralCreditUseCase extends UseCase<Input, Output> {
    constructor(private readonly repo: IReferralsRepository) { super(); }

    async execute(input: Input): Promise<Result<Output>> {
        if (!input.isFirstPayment) {
            return Result.success({ credit: null, reason: "not_first_payment" });
        }

        const infoRes = await this.repo.getTenantReferralInfo(input.referredTenantId);
        if (infoRes.isFailure) return Result.fail(infoRes.getError());

        const info = infoRes.getValue();
        if (!info.referredBy) {
            return Result.success({ credit: null, reason: "no_referrer" });
        }

        const amountUsd = Math.round(input.paidAmountUsd * REFERRAL_PERCENT * 100) / 100;
        if (amountUsd <= 0) {
            return Result.success({ credit: null, reason: "zero_amount" });
        }

        const grantRes = await this.repo.grantCredit({
            referrerTenantId:       info.referredBy,
            referredTenantId:       input.referredTenantId,
            sourcePaymentRequestId: input.sourcePaymentRequestId,
            amountUsd,
        });

        if (grantRes.isFailure) return Result.fail(grantRes.getError());

        return Result.success({ credit: grantRes.getValue() });
    }
}
