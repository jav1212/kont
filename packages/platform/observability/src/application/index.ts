import type { IncidentSeverity, IncidentSource } from "../contracts/index";

/** JSON value accepted by incident attributes after sanitization. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
/** Immutable JSON object accepted by incident persistence adapters. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Identifies the service and runtime that observed an incident. */
export interface IncidentResource {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
  readonly platform: string;
}

/** Optional authenticated ownership context associated with an incident. */
export interface IncidentActor {
  readonly tenantId: string | null;
  readonly organizationId: string | null;
  readonly companyId: string | null;
  readonly userId: string | null;
}

/** Distributed tracing identifiers associated with an incident. */
export interface IncidentCorrelation {
  readonly requestId: string | null;
  readonly traceId: string | null;
  readonly spanId: string | null;
}

/** Sanitized, immutable incident persisted through an observability adapter. */
export interface Incident {
  readonly schemaVersion: 1;
  readonly code: string;
  readonly eventName: string;
  readonly severity: IncidentSeverity;
  readonly source: IncidentSource;
  readonly occurredAt: string;
  readonly observedAt: string;
  readonly publicMessage: string;
  readonly technicalMessage: string;
  readonly errorType: string;
  readonly stackTrace: string | null;
  readonly resource: IncidentResource;
  readonly actor: IncidentActor;
  readonly correlation: IncidentCorrelation;
  readonly route: string | null;
  readonly method: string | null;
  readonly statusCode: number | null;
  readonly fingerprint: string | null;
  readonly retryable: boolean | null;
  readonly attributes: JsonObject;
}

/** Persistence port owned by the observability application layer. */
export interface IncidentRecorder {
  /**
   * Persists a sanitized incident idempotently by its stable code.
   * @param incident - Incident produced by the recording use case.
   * @returns A promise that resolves after persistence succeeds.
   * @throws A storage-specific failure when persistence is unavailable.
   */
  record(incident: Incident): Promise<void>;
}

/** Time source used to make incident recording deterministic. */
export interface Clock {
  /**
   * Reads the current instant.
   * @returns A date representing the current time.
   */
  now(): Date;
}

/** Generator for stable public incident references. */
export interface IncidentCodeGenerator {
  /**
   * Creates an incident code associated with an occurrence date.
   * @param occurredAt - Instant at which the incident occurred.
   * @returns A stable public incident code.
   */
  create(occurredAt: Date): string;
}

/** Input accepted by the incident-recording use case. */
export interface RecordIncidentCommand {
  readonly eventName: string;
  readonly severity: IncidentSeverity;
  readonly source: IncidentSource;
  readonly error: unknown;
  readonly resource: IncidentResource;
  readonly actor?: Partial<IncidentActor>;
  readonly correlation?: Partial<IncidentCorrelation>;
  readonly occurredAt?: Date;
  readonly publicMessage?: string;
  readonly technicalMessage?: string;
  readonly stackTrace?: string;
  readonly route?: string;
  readonly method?: string;
  readonly statusCode?: number;
  readonly fingerprint?: string;
  readonly retryable?: boolean;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly code?: string;
}

/** Truthful result describing whether an incident reached storage. */
export type IncidentReceipt =
  | { readonly status: "recorded"; readonly code: string }
  | { readonly status: "not-recorded"; readonly code: string; readonly reason: "storage-unavailable" };

const DEFAULT_PUBLIC_MESSAGE = "Ocurrió un error inesperado.";
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const MAX_EVENT_NAME = 120;
const MAX_TECHNICAL_TEXT = 8_000;
const MAX_ATTRIBUTE_TEXT = 1_000;
const MAX_COLLECTION_SIZE = 40;
const MAX_ATTRIBUTE_DEPTH = 4;
const SENSITIVE_KEY = /(authorization|cookie|password|token|secret|api[_-]?key|service[_-]?role|cedula|national[_-]?id|bank|account[_-]?number|email|phone)/i;

/** Applies portable incident policy; storage failure is reported without masking the original failure. */
export class RecordIncident {
  /**
   * Creates the incident-recording use case with explicit dependencies.
   * @param recorder - Persistence port receiving sanitized incidents.
   * @param codes - Generator for public incident references.
   * @param clock - Time source used for observation timestamps.
   */
  constructor(
    private readonly recorder: IncidentRecorder,
    private readonly codes: IncidentCodeGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * Validates, sanitizes, and attempts to persist an incident.
   * @param command - Untrusted incident details and trusted execution context.
   * @returns A receipt that preserves the incident code even when storage is unavailable.
   * @throws {TypeError} When the event name is not a stable low-cardinality identifier.
   */
  async execute(command: RecordIncidentCommand): Promise<IncidentReceipt> {
    assertEventName(command.eventName);
    const observedAt = this.clock.now();
    const occurredAt = command.occurredAt ?? observedAt;
    const normalized = normalizeError(command.error);
    const code = command.code ?? this.codes.create(occurredAt);
    const incident: Incident = {
      schemaVersion: 1,
      code,
      eventName: command.eventName,
      severity: command.severity,
      source: command.source,
      occurredAt: occurredAt.toISOString(),
      observedAt: observedAt.toISOString(),
      publicMessage: sanitizeLine(command.publicMessage?.trim() || DEFAULT_PUBLIC_MESSAGE, MAX_TECHNICAL_TEXT),
      technicalMessage: sanitizeLine(command.technicalMessage ?? normalized.message, MAX_TECHNICAL_TEXT),
      errorType: sanitizeLine(normalized.name || "Error", 200),
      stackTrace: truncate(command.stackTrace ?? normalized.stack ?? "", MAX_TECHNICAL_TEXT) || null,
      resource: sanitizeResource(command.resource),
      actor: {
        tenantId: command.actor?.tenantId ?? null,
        organizationId: command.actor?.organizationId ?? null,
        companyId: command.actor?.companyId ?? null,
        userId: command.actor?.userId ?? null,
      },
      correlation: {
        requestId: command.correlation?.requestId ?? null,
        traceId: command.correlation?.traceId ?? null,
        spanId: command.correlation?.spanId ?? null,
      },
      route: command.route ?? null,
      method: command.method ?? null,
      statusCode: command.statusCode ?? null,
      fingerprint: command.fingerprint ?? null,
      retryable: command.retryable ?? null,
      attributes: sanitizeAttributes(command.attributes),
    };

    try {
      await this.recorder.record(incident);
      return { status: "recorded", code };
    } catch {
      return { status: "not-recorded", code, reason: "storage-unavailable" };
    }
  }
}

/** Incident code generator backed by an injected UUID source. */
export class UuidIncidentCodeGenerator implements IncidentCodeGenerator {
  /**
   * Creates a generator around a UUID-producing function.
   * @param uuid - Function returning a sufficiently random UUID string.
   */
  constructor(private readonly uuid: () => string) {}

  /** {@inheritDoc IncidentCodeGenerator.create} */
  create(occurredAt: Date): string {
    const stamp = occurredAt.toISOString().slice(0, 10).replaceAll("-", "");
    const random = this.uuid().replaceAll("-", "").slice(0, 8).toUpperCase();
    return `KNT-${stamp}-${random}`;
  }
}

/**
 * Converts arbitrary metadata into bounded JSON while removing sensitive fields.
 * @param attributes - Optional untrusted metadata supplied with an incident.
 * @returns An immutable-compatible JSON object with bounded depth, size, and text.
 */
export function sanitizeAttributes(attributes: Readonly<Record<string, unknown>> | undefined): JsonObject {
  if (!attributes) return {};
  return sanitizeObject(attributes, 0, new WeakSet<object>());
}

function sanitizeObject(value: Readonly<Record<string, unknown>>, depth: number, seen: WeakSet<object>): JsonObject {
  if (seen.has(value)) return { value: "[Circular]" };
  seen.add(value);
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_COLLECTION_SIZE)) {
    if (SENSITIVE_KEY.test(key)) continue;
    const sanitized = sanitizeValue(item, depth + 1, seen);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): JsonValue | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeLine(value, MAX_ATTRIBUTE_TEXT);
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  if (typeof value !== "object") return undefined;
  if (depth > MAX_ATTRIBUTE_DEPTH) return "[Truncated]";
  if (seen.has(value)) return "[Circular]";
  if (Array.isArray(value)) {
    seen.add(value);
    return value.slice(0, MAX_COLLECTION_SIZE).map((item) => sanitizeValue(item, depth + 1, seen) ?? null);
  }
  return sanitizeObject(value as Readonly<Record<string, unknown>>, depth, seen);
}

function sanitizeResource(resource: IncidentResource): IncidentResource {
  return {
    serviceName: sanitizeLine(resource.serviceName, 120),
    serviceVersion: sanitizeLine(resource.serviceVersion, 80),
    environment: sanitizeLine(resource.environment, 80),
    platform: sanitizeLine(resource.platform, 80),
  };
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function assertEventName(eventName: string): void {
  if (eventName.length > MAX_EVENT_NAME || !EVENT_NAME_PATTERN.test(eventName)) {
    throw new TypeError("eventName must be a stable lowercase identifier.");
  }
}

function sanitizeLine(value: string, maximum: number): string {
  return truncate(value.replace(/[\r\n\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g, " "), maximum);
}

function truncate(value: string, maximum: number): string { return value.slice(0, maximum); }

export type { IncidentSeverity, IncidentSource } from "../contracts/index";
