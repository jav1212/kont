import type { NativePlatformStatusDto, NativePortalAvailability } from "@kontave/native-api-contracts";
import type { DesktopPlatformStatusState } from "../../shared/desktop-api.js";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request.js";

export class DesktopPlatformStatusSource {
  constructor(
    private readonly baseUrl: string,
    private readonly request: DesktopAuthenticatedRequest,
  ) {}

  async getCurrent(): Promise<DesktopPlatformStatusState> {
    const response = await this.request.fetch(new URL("/api/native/v1/platform/status", this.baseUrl));
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(readApiError(payload));
    const data = readStatus(payload);
    return { status: "ready", availability: data.status, observedAt: data.observedAt };
  }
}

function readStatus(payload: unknown): Pick<NativePlatformStatusDto, "status" | "observedAt"> {
  const envelope = readRecord(payload, "La respuesta del estado de portales no es válida.");
  const data = readRecord(envelope.data, "La respuesta del estado de portales no contiene datos válidos.");
  return {
    status: readAvailability(data.status),
    observedAt: data.observedAt === null ? null : readTimestamp(data.observedAt),
  };
}

function readAvailability(value: unknown): NativePortalAvailability {
  if (value === "operational" || value === "degraded" || value === "down" || value === "unknown") return value;
  throw new Error("El estado agregado de portales no es válido.");
}

function readTimestamp(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("La fecha del estado de portales no es válida.");
  return value;
}

function readApiError(payload: unknown): string {
  const envelope = readRecord(payload, "No se pudo obtener el estado de portales.");
  const error = envelope.error && typeof envelope.error === "object" ? envelope.error as Record<string, unknown> : null;
  return error && typeof error.message === "string" ? error.message : "No se pudo obtener el estado de portales.";
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}
