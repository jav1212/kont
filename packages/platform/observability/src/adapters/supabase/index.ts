import type { SupabaseClient } from "@supabase/supabase-js";
import type { Incident, IncidentRecorder } from "../../application/index";

/** Row written to the existing `system_error_logs` persistence contract. */
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

/** Narrow table operation required from the Supabase SDK. */
export interface IncidentTableWriter {
  /**
   * Writes an incident row idempotently by error code.
   * @param row - Sanitized persistence representation.
   * @param options - Required conflict behavior for incident idempotency.
   * @returns A promise-like Supabase result containing a possible storage error.
   */
  upsert(
    row: SystemErrorLogRow,
    options: { readonly onConflict: "error_code"; readonly ignoreDuplicates: true },
  ): PromiseLike<{ readonly error: { readonly message: string } | null }>;
}

/** Narrow Supabase client boundary required by the incident adapter. */
export interface IncidentSupabaseClient {
  /**
   * Selects the existing incident table.
   * @param table - Stable table name owned by the persistence adapter.
   * @returns A writer capable of the required idempotent upsert.
   */
  from(table: "system_error_logs"): IncidentTableWriter;
}

/** Maps portable incidents to the existing Web table without owning client creation or credentials. */
export class SupabaseIncidentRecorder implements IncidentRecorder {
  /**
   * Creates an incident recorder around an injected narrow client.
   * @param client - Supabase-compatible client that does not expose credentials here.
   */
  constructor(private readonly client: IncidentSupabaseClient) {}

  /** {@inheritDoc IncidentRecorder.record} */
  async record(incident: Incident): Promise<void> {
    const { error } = await this.client.from("system_error_logs").upsert(mapIncidentToSystemErrorLog(incident), {
      onConflict: "error_code",
      ignoreDuplicates: true,
    });

    if (error) throw new Error(`Could not persist incident: ${error.message}`, { cause: error });
  }
}

/**
 * Adapts a standard Supabase client to the incident recorder port.
 * @param client - Authenticated Supabase client owned by the composition root.
 * @returns A recorder that writes to the existing incident table.
 */
export function createSupabaseIncidentRecorder(client: SupabaseClient): SupabaseIncidentRecorder {
  return new SupabaseIncidentRecorder(client);
}

/**
 * Maps a portable incident to the backward-compatible database row.
 * @param incident - Sanitized incident produced by the application layer.
 * @returns A row preserving structured metadata under the observability namespace.
 */
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
