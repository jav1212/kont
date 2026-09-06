import type {
  ApiError,
  ApiErrorCode,
  ApiSuccess,
} from "@kontave/client-contracts";
import { registerEnvelopeExecutor } from "./response-envelope";

export type KontaveClientPlatform = "desktop" | "mobile" | "web";
export type KontaveRequest = (
  input: URL | string,
  init?: RequestInit,
) => Promise<Response>;

/** Protocol-neutral request capability consumed by remote domain adapters. */
export interface RemoteTransport {
  /**
   * Reads one API resource.
   * @param path - Relative Client API path.
   * @returns The decoded response data.
   * @throws {@link KontaveRemoteFailure} when transport or protocol handling fails.
   */
  get<T>(path: string): Promise<T>;
  /**
   * Sends a request with explicit HTTP semantics.
   * @param path - Relative Client API path.
   * @param init - Fetch-compatible request configuration.
   * @returns The decoded response data.
   * @throws {@link KontaveRemoteFailure} when transport or protocol handling fails.
   */
  request<T>(path: string, init: RequestInit): Promise<T>;
}

interface KontaveRemoteClientConfigurationBase {
  readonly baseUrl: string;
  readonly getAccessToken?: () => Promise<string | null>;
  /** Platform authentication decorators, refresh coordination and IPC remain injectable. */
  readonly authenticatedRequest?: KontaveRequest;
  readonly request?: KontaveRequest;
  readonly timeoutMs?: number;
}

export type KontaveRemoteClientConfiguration =
  KontaveRemoteClientConfigurationBase &
    (
      | { readonly platform: KontaveClientPlatform; readonly client?: never }
      /** @deprecated Use platform. Kept until legacy client-api consumers migrate. */
      | {
          readonly client: Exclude<KontaveClientPlatform, "web">;
          readonly platform?: never;
        }
    );

export class KontaveRemoteFailure extends Error {
  readonly code: ApiErrorCode | "INVALID_RESPONSE" | "NETWORK_UNAVAILABLE";
  readonly requestId: string | null;

  /**
   * Creates a transport failure whose stable fields can cross IPC and renderer boundaries.
   * @param code - Stable protocol or transport failure code.
   * @param message - Safe diagnostic message suitable for client presentation.
   * @param requestId - Backend correlation identifier, or `null` before a response exists.
   * @param options - Standard error options used to retain the original cause.
   */
  constructor(
    code: ApiErrorCode | "INVALID_RESPONSE" | "NETWORK_UNAVAILABLE",
    message: string,
    requestId: string | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "KontaveRemoteFailure";
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Renderer-neutral transport for the Kontave backend. Feature adapters own
 * paths and DTO mapping; applications only supply platform request mechanics.
 */
export class KontaveRemoteClient implements RemoteTransport {
  /**
   * Captures immutable connection and platform request configuration.
   * @param configuration - Base URL, platform identity, authentication and timeout policy.
   */
  constructor(
    private readonly configuration: KontaveRemoteClientConfiguration,
  ) {
    registerEnvelopeExecutor(this, (path, init) => this.execute(path, init));
  }

  /**
   * Executes a typed GET request and unwraps the standard Kontave response envelope.
   * @param path - Relative API path resolved against the configured Kontave origin.
   * @returns The validated `data` member from the response envelope.
   * @throws {@link KontaveRemoteFailure} when authentication, transport or protocol validation fails.
   */
  async get<T>(path: string): Promise<T> {
    return (await this.execute(path, { method: "GET" })).data as T;
  }

  /**
   * Executes an API request with a caller-provided HTTP method and payload.
   * @param path - Relative API path resolved against the configured Kontave origin.
   * @param init - Fetch-compatible method, headers and optional serialized body.
   * @returns The validated `data` member from the response envelope.
   * @throws {@link KontaveRemoteFailure} when authentication, timeout, transport or protocol validation fails.
   */
  async request<T>(path: string, init: RequestInit): Promise<T> {
    return (await this.execute(path, init)).data as T;
  }

  /**
   * Executes a request while retaining metadata for capability-owned decoders.
   * @param path - API path resolved against the configured origin.
   * @param init - Request method, headers and serialized payload.
   * @returns The validated response envelope, with untrusted data.
   * @throws {KontaveRemoteFailure} On authentication, protocol or transport failure.
   */
  private async execute(
    path: string,
    init: RequestInit,
  ): Promise<ApiSuccess<unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.configuration.timeoutMs ?? 10_000,
    );
    try {
      const requestInit = await this.createRequest(init, controller.signal);
      const execute =
        this.configuration.authenticatedRequest ??
        this.configuration.request ??
        globalThis.fetch;
      const response = await execute(
        new URL(path, this.configuration.baseUrl),
        requestInit,
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw readFailure(payload);
      return readSuccess<unknown>(payload);
    } catch (cause: unknown) {
      if (cause instanceof KontaveRemoteFailure) throw cause;
      throw new KontaveRemoteFailure(
        "NETWORK_UNAVAILABLE",
        cause instanceof Error && cause.name === "AbortError"
          ? "La solicitud tardó demasiado."
          : "No se pudo conectar con Kontave.",
        null,
        { cause },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Applies common headers, authentication and cancellation without knowing feature endpoints.
   * @param init - Feature-owned request options.
   * @param signal - Timeout signal owned by the transport operation.
   * @returns Request options ready for the injected platform request mechanism.
   * @throws {@link KontaveRemoteFailure} when no authenticated session is available.
   */
  private async createRequest(
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<RequestInit> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (!this.configuration.authenticatedRequest) {
      const accessToken = await this.configuration.getAccessToken?.();
      if (!accessToken) {
        throw new KontaveRemoteFailure(
          "AUTHENTICATION_REQUIRED",
          "La sesión ya no está disponible.",
        );
      }
      headers.set("authorization", `Bearer ${accessToken}`);
    }
    headers.set(
      "x-kontave-client",
      this.configuration.platform ?? this.configuration.client,
    );
    return { ...init, headers, signal };
  }
}

function readSuccess<T>(payload: unknown): ApiSuccess<T> {
  if (
    !isRecord(payload) ||
    !("data" in payload) ||
    !isRecord(payload.meta) ||
    typeof payload.meta.requestId !== "string"
  ) {
    throw new KontaveRemoteFailure(
      "INVALID_RESPONSE",
      "Kontave devolvió una respuesta no válida.",
      isRecord(payload) &&
      isRecord(payload.meta) &&
      typeof payload.meta.requestId === "string"
        ? payload.meta.requestId
        : null,
    );
  }
  return payload as unknown as ApiSuccess<T>;
}

function readFailure(payload: unknown): KontaveRemoteFailure {
  if (
    !isRecord(payload) ||
    !isRecord(payload.error) ||
    typeof payload.error.code !== "string" ||
    typeof payload.error.message !== "string" ||
    typeof payload.error.requestId !== "string"
  ) {
    return new KontaveRemoteFailure(
      "INVALID_RESPONSE",
      "Kontave devolvió un error no válido.",
      isRecord(payload) &&
      isRecord(payload.error) &&
      typeof payload.error.requestId === "string"
        ? payload.error.requestId
        : null,
    );
  }
  const error = payload as unknown as ApiError;
  return new KontaveRemoteFailure(
    error.error.code,
    error.error.message,
    error.error.requestId,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
