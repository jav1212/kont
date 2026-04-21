export interface ReferralCode {
    tenantId:   string;
    code:       string;
    referredBy: string | null;
}
