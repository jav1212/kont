import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PortalMonitoringRepository } from "../../application";
import {
  PortalMonitoringFailure,
  PortalAvailability,
  type PortalStatus,
} from "../../domain";
import { latestPortalStatusRowSchema } from "./persistence-codecs";

export interface PortalMonitoringSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/**
 * Creates the server-side portal-monitoring repository.
 *
 * @param configuration - Supabase endpoint and service-role credential.
 * @returns A configured monitoring repository.
 * @throws When the Supabase client rejects invalid construction parameters.
 */
export function createPortalMonitoringRepository(
  configuration: PortalMonitoringSupabaseConfiguration,
): PortalMonitoringRepository {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabasePortalMonitoringRepository(client);
}

/** Supabase-backed source of the latest portal observations. */
export class SupabasePortalMonitoringRepository implements PortalMonitoringRepository {
  /**
   * Creates a repository over a Supabase client.
   *
   * @param client - Server-side Supabase client used for the monitoring view.
   */
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Loads, validates and maps active portal observations.
   *
   * @returns Portals ordered by their configured display order.
   * @throws {PortalMonitoringFailure} When querying or decoding fails.
   */
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
      if (cause instanceof PortalMonitoringFailure) throw cause;
      throw new PortalMonitoringFailure(
        "PORTAL_MONITORING_REPOSITORY_UNAVAILABLE",
        "No se pudo consultar el estado de los portales.",
        { cause },
      );
    }
  }
}
