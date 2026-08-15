import type { NativeApiError, NativeApiErrorCode, NativeApiSuccess } from "@kontave/native-api-contracts";

export type NativeClientKind = "desktop" | "mobile";

export class NativeApiFailure extends Error {
  constructor(readonly code: NativeApiErrorCode | "INVALID_RESPONSE" | "NETWORK_UNAVAILABLE", message: string, readonly requestId: string | null = null, options?: ErrorOptions) {
    super(message, options); this.name = "NativeApiFailure";
  }
}

export class NativeApiClient {
  constructor(private readonly configuration: {
    readonly baseUrl: string;
    readonly client: NativeClientKind;
    readonly getAccessToken?: () => Promise<string | null>;
    readonly authenticatedFetch?: (input: URL | string, init?: RequestInit) => Promise<Response>;
    readonly timeoutMs?: number;
  }) {}

  async get<T>(path: string): Promise<T> { return this.request<T>(path, { method: "GET" }); }

  async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.configuration.timeoutMs ?? 10_000);
    try {
      const request = await this.createRequest(init, controller.signal);
      const response = this.configuration.authenticatedFetch
        ? await this.configuration.authenticatedFetch(new URL(path, this.configuration.baseUrl), request)
        : await fetch(new URL(path, this.configuration.baseUrl), request);
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw readFailure(payload);
      return readSuccess<T>(payload).data;
    } catch (cause: unknown) {
      if (cause instanceof NativeApiFailure) throw cause;
      throw new NativeApiFailure("NETWORK_UNAVAILABLE", cause instanceof Error && cause.name === "AbortError" ? "La solicitud tardó demasiado." : "No se pudo conectar con Kontave.", null, { cause });
    } finally { clearTimeout(timeout); }
  }

  private async createRequest(init: RequestInit, signal: AbortSignal): Promise<RequestInit> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (!this.configuration.authenticatedFetch) {
      const accessToken = await this.configuration.getAccessToken?.();
      if (!accessToken) throw new NativeApiFailure("AUTHENTICATION_REQUIRED", "La sesión ya no está disponible.");
      headers.set("authorization", `Bearer ${accessToken}`);
      headers.set("x-kontave-client", this.configuration.client);
    }
    return { ...init, headers, signal };
  }
}

function readSuccess<T>(payload: unknown): NativeApiSuccess<T> {
  if (!isRecord(payload) || !("data" in payload) || !isRecord(payload.meta) || typeof payload.meta.requestId !== "string") {
    throw new NativeApiFailure("INVALID_RESPONSE", "Kontave devolvió una respuesta no válida.");
  }
  return payload as unknown as NativeApiSuccess<T>;
}

function readFailure(payload: unknown): NativeApiFailure {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.code !== "string" || typeof payload.error.message !== "string") {
    return new NativeApiFailure("INVALID_RESPONSE", "Kontave devolvió un error no válido.");
  }
  const error = payload as unknown as NativeApiError;
  return new NativeApiFailure(error.error.code, error.error.message, error.error.requestId);
}

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
