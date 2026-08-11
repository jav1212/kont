import { AttachReferral, GetReferralOverview } from "@kontave/referrals-application";
import { createReferralsInfrastructure } from "@kontave/referrals-supabase";

export function createReferralActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Native referral infrastructure is not configured.");

  const { repository, credits } = createReferralsInfrastructure({ url, serviceRoleKey });
  return {
    attach: new AttachReferral(repository),
    overview: new GetReferralOverview(repository, credits),
  };
}
