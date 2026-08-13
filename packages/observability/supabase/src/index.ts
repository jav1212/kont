import type { SupabaseClient } from "@supabase/supabase-js";
import type { Incident, IncidentRecorder } from "@kontave/observability-application";

export interface SystemErrorLogRow {
  readonly error_code: string;
  readonly message: string;
  readonly technical_message: string;
  readonly stack_trace: string | null;
  readonly source: string;
  readonly route: string | null;
  readonly method: string | null;
  readonly status_code: number | null;
  readonly tenant_id: string | null;
  readonly user_id: string | null;
  readonly request_id: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface IncidentTableWriter {
  upsert(
    row: SystemErrorLogRow,
    options: { readonly onConflict: "error_code"; readonly ignoreDuplicates: true },
  ): PromiseLike<{ readonly error: { readonly message: string } | null }>;
}

export interface IncidentSupabaseClient {
  from(table: "system_error_logs"): IncidentTableWriter;
}

/** Maps portable incidents to the existing Web table without owning client creation or credentials. */
export class SupabaseIncidentRecorder implements IncidentRecorder {
  constructor(private readonly client: IncidentSupabaseClient) {}

  async record(incident: Incident): Promise<void> {
    const { error } = await this.client.from("system_error_logs").upsert(mapIncidentToSystemErrorLog(incident), {
      onConflict: "error_code",
      ignoreDuplicates: true,
    });

    if (error) throw new Error(`Could not persist incident: ${error.message}`, { cause: error });
  }
}

export function createSupabaseIncidentRecorder(client: SupabaseClient): SupabaseIncidentRecorder {
  return new SupabaseIncidentRecorder(client);
}

export function mapIncidentToSystemErrorLog(incident: Incident): SystemErrorLogRow {
  return {
      error_code: incident.code,
      message: incident.publicMessage,
      technical_message: incident.technicalMessage,
      stack_trace: incident.stackTrace,
      source: incident.source,
      route: incident.route,
      method: incident.method,
      status_code: incident.statusCode,
      tenant_id: incident.actor.tenantId,
      user_id: incident.actor.userId,
      request_id: incident.correlation.requestId,
      metadata: {
        ...incident.attributes,
        observability: {
          schema_version: incident.schemaVersion,
          event_name: incident.eventName,
          severity: incident.severity,
          occurred_at: incident.occurredAt,
          observed_at: incident.observedAt,
          resource: incident.resource,
          organization_id: incident.actor.organizationId,
          company_id: incident.actor.companyId,
          trace_id: incident.correlation.traceId,
          span_id: incident.correlation.spanId,
          fingerprint: incident.fingerprint,
          retryable: incident.retryable,
          error_type: incident.errorType,
        },
      },
  };
}
