import { GetPortalMonitoring } from "@kontave/portal-monitoring/application";
import { createPortalMonitoringRepository } from "@kontave/portal-monitoring/supabase";

export function createPortalMonitoringActions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey)
    throw new Error("Native portal monitoring infrastructure is not configured.");
  const repository = createPortalMonitoringRepository({ url, serviceRoleKey });
  return { getPortalMonitoring: new GetPortalMonitoring(repository) };
}
