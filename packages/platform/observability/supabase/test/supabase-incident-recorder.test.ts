import assert from "node:assert/strict";
import test from "node:test";
import type { Incident } from "@kontave/observability-application";
import {
  SupabaseIncidentRecorder,
  type IncidentSupabaseClient,
  type SystemErrorLogRow,
} from "../src/index";

const incident: Incident = {
  schemaVersion: 1,
  code: "KNT-20260813-ABCDEF12",
  eventName: "api.unexpected_failure",
  severity: "error",
  source: "api",
  occurredAt: "2026-08-13T18:00:00.000Z",
  observedAt: "2026-08-13T18:00:01.000Z",
  publicMessage: "No se pudo completar la operación.",
  technicalMessage: "connection refused",
  errorType: "Error",
  stackTrace: "stack",
  resource: { serviceName: "web", serviceVersion: "1.0.0", environment: "test", platform: "nextjs" },
  actor: { tenantId: "tenant-1", organizationId: "organization-1", companyId: "company-1", userId: "user-1" },
  correlation: { requestId: "request-1", traceId: "trace-1", spanId: "span-1" },
  route: "/api/example",
  method: "POST",
  statusCode: 500,
  fingerprint: "api.unexpected_failure",
  retryable: true,
  attributes: { operation: "save" },
};

class RecordingClient implements IncidentSupabaseClient {
  table: string | null = null;
  row: SystemErrorLogRow | null = null;
  options: { readonly onConflict: "error_code"; readonly ignoreDuplicates: true } | null = null;

  from(table: "system_error_logs") {
    this.table = table;
    return {
      upsert: async (
        row: SystemErrorLogRow,
        options: { readonly onConflict: "error_code"; readonly ignoreDuplicates: true },
      ) => {
        this.row = row;
        this.options = options;
        return { error: null };
      },
    };
  }
}

test("maps a portable incident and writes idempotently by incident code", async () => {
  const client = new RecordingClient();
  await new SupabaseIncidentRecorder(client).record(incident);

  assert.equal(client.table, "system_error_logs");
  assert.equal(client.row?.error_code, incident.code);
  assert.equal(client.row?.message, incident.publicMessage);
  assert.deepEqual(client.options, { onConflict: "error_code", ignoreDuplicates: true });
  assert.deepEqual(client.row?.metadata, {
    operation: "save",
    observability: {
      schema_version: 1,
      event_name: "api.unexpected_failure",
      severity: "error",
      occurred_at: "2026-08-13T18:00:00.000Z",
      observed_at: "2026-08-13T18:00:01.000Z",
      resource: incident.resource,
      organization_id: "organization-1",
      company_id: "company-1",
      trace_id: "trace-1",
      span_id: "span-1",
      fingerprint: "api.unexpected_failure",
      retryable: true,
      error_type: "Error",
    },
  });
});

test("exposes provider failures to the application boundary", async () => {
  const client: IncidentSupabaseClient = {
    from: () => ({ upsert: async () => ({ error: { message: "database unavailable" } }) }),
  };
  await assert.rejects(() => new SupabaseIncidentRecorder(client).record(incident), /database unavailable/);
});
