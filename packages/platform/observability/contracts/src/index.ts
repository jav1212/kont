export const INCIDENT_SOURCES = ["api", "client", "database", "auth", "network", "unknown"] as const;
export const INCIDENT_SEVERITIES = ["warning", "error", "fatal"] as const;

export type IncidentSource = (typeof INCIDENT_SOURCES)[number];
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

/** Untrusted transport payload. Actor and tenant identities are intentionally absent. */
export interface ClientIncidentPayload {
  readonly code: string;
  readonly eventName?: string;
  readonly message: string;
  readonly technicalMessage?: string;
  readonly stack?: string;
  readonly source?: IncidentSource;
  readonly severity?: IncidentSeverity;
  readonly occurredAt?: string;
  readonly route?: string;
  readonly method?: string;
  readonly requestId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const INCIDENT_CODE_PATTERN = /^KNT-[0-9]{8}-[A-Z0-9]{8}$/;

export function isIncidentCode(value: unknown): value is string {
  return typeof value === "string" && INCIDENT_CODE_PATTERN.test(value);
}

export function isIncidentSource(value: unknown): value is IncidentSource {
  return typeof value === "string" && (INCIDENT_SOURCES as readonly string[]).includes(value);
}

export function isIncidentSeverity(value: unknown): value is IncidentSeverity {
  return typeof value === "string" && (INCIDENT_SEVERITIES as readonly string[]).includes(value);
}
