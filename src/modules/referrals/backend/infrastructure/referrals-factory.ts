// referrals-factory — ensambla el grafo de dependencias del módulo referrals.
// Role: punto de entrada de la infraestructura; nunca instanciar use cases a mano.

import { ServerSupabaseSource }     from "@/src/shared/backend/source/infra/server-supabase";
import { SupabaseReferralsRepository } from "./repositories/supabase-referrals.repository";
import { GetMyReferralUseCase }      from "../application/queries/get-my-referral.use-case";
import { GetAvailableCreditUseCase } from "../application/queries/get-available-credit.use-case";
import { AttachReferrerUseCase }     from "../application/commands/attach-referrer.use-case";
import { GrantReferralCreditUseCase } from "../application/commands/grant-referral-credit.use-case";
import { ConsumeCreditsUseCase }     from "../application/commands/consume-credits.use-case";
import { RefundCreditsForPaymentUseCase } from "../application/commands/refund-credits-for-payment.use-case";

export function getReferralsActions() {
    const repo = new SupabaseReferralsRepository(new ServerSupabaseSource());

    return {
        getMyReferral:           new GetMyReferralUseCase(repo),
        getAvailableCredit:      new GetAvailableCreditUseCase(repo),
        attachReferrer:          new AttachReferrerUseCase(repo),
        grantReferralCredit:     new GrantReferralCreditUseCase(repo),
        consumeCredits:          new ConsumeCreditsUseCase(repo),
        refundCreditsForPayment: new RefundCreditsForPaymentUseCase(repo),
    };
}

export type ReferralsActions = ReturnType<typeof getReferralsActions>;
