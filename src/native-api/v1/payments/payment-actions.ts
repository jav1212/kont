import { ApplyBillingCredit, GetBillingCreditBalance } from "@kontave/billing-application";
import { ConfirmPayment } from "@kontave/billing-orchestration";
import { createBillingCreditLedger } from "@kontave/billing-supabase";
import { ListPayments, RecordPaymentConfirmation } from "@kontave/payments-application";
import { createPaymentsInfrastructure } from "@kontave/payments-supabase";
import { GrantReferralReward } from "@kontave/referrals-application";
import { createReferralsInfrastructure } from "@kontave/referrals-supabase";

export function createPaymentActions(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("Native payment infrastructure is not configured.");const payments=createPaymentsInfrastructure({url,serviceRoleKey:key});const referrals=createReferralsInfrastructure({url,serviceRoleKey:key});const ledger=createBillingCreditLedger({url,serviceRoleKey:key});return{list:new ListPayments(payments.repository),confirm:new ConfirmPayment(new RecordPaymentConfirmation(payments.repository),new GrantReferralReward(referrals.repository,referrals.credits),payments.outbox),creditBalance:new GetBillingCreditBalance(ledger),applyCredit:new ApplyBillingCredit(ledger)}}
