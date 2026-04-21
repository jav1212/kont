export interface ReferralStats {
    totalReferrals:      number;   // tenants que usaron mi código
    activatedReferrals:  number;   // referidos con al menos un pago aprobado (crédito emitido)
    totalEarnedUsd:      number;   // suma de amount_usd de todos mis créditos
    availableCreditUsd:  number;   // suma de remaining_usd de créditos available/partial
}
