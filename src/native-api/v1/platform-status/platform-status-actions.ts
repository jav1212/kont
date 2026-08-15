import { GetPlatformStatus } from "@kontave/platform-status-application";
import { createPlatformStatusRepository } from "@kontave/platform-status-supabase";

export function createPlatformStatusActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Native platform status infrastructure is not configured.");
  const repository = createPlatformStatusRepository({ url, serviceRoleKey });
  return { getPlatformStatus: new GetPlatformStatus(repository) };
}
