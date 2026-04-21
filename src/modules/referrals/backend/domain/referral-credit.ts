export type ReferralCreditStatus = 'available' | 'partial' | 'consumed';

export interface ReferralCredit {
    id:                     string;
    referrerTenantId:       string;
    referredTenantId:       string;
    sourcePaymentRequestId: string;
    amountUsd:              number;
    remainingUsd:           number;
    status:                 ReferralCreditStatus;
    createdAt:              string;
}

export interface ReferralRedemption {
    id:                string;
    creditId:          string;
    paymentRequestId:  string;
    amountUsd:         number;
    createdAt:         string;
}
