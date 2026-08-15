import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PlatformStatusRepository } from "@kontave/platform-status-application";
import {
  PlatformStatusFailure,
  PortalAvailability,
  type PortalStatus,
} from "@kontave/platform-status-domain";
import { latestPortalStatusRowSchema } from "./persistence-codecs.js";

export interface PlatformStatusSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

export function createPlatformStatusRepository(
  configuration: PlatformStatusSupabaseConfiguration,
): PlatformStatusRepository {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabasePlatformStatusRepository(client);
}

export class SupabasePlatformStatusRepository implements PlatformStatusRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listActivePortalStatuses(): Promise<readonly PortalStatus[]> {
    try {
      const { data, error } = await this.client
        .from("platform_status_latest_checks")
        .select("id,slug,name,category,logo_url,display_order,status,response_time_ms,checked_at")
        .order("display_order", { ascending: true });
      if (error) throw error;

      return latestPortalStatusRowSchema.array().parse(data ?? []).map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        category: row.category,
        logoUrl: row.logo_url,
        status: row.status ?? PortalAvailability.Unknown,
        responseTimeMs: row.response_time_ms,
        checkedAt: row.checked_at,
      }));
    } catch (cause: unknown) {
      if (cause instanceof PlatformStatusFailure) throw cause;
      throw new PlatformStatusFailure(
        "PLATFORM_STATUS_REPOSITORY_UNAVAILABLE",
        "No se pudo consultar el estado de los portales.",
        { cause },
      );
    }
  }
}
