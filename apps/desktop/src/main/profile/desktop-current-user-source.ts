import type { NativeCurrentUserDto } from "@kontave/native-api-contracts";
import type { DesktopCurrentUserState } from "../../shared/desktop-api";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";

export class DesktopCurrentUserSource {
  constructor(
    private readonly baseUrl: string,
    private readonly request: DesktopAuthenticatedRequest,
  ) {}

  async getCurrent(): Promise<DesktopCurrentUserState> {
    const response = await this.request.fetch(new URL("/api/native/v1/me", this.baseUrl));
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(readApiError(payload));
    return { status: "ready", user: readCurrentUser(payload) };
  }
}

function readCurrentUser(payload: unknown): NativeCurrentUserDto {
  const envelope = readRecord(payload, "La respuesta del perfil no es válida.");
  const data = readRecord(envelope.data, "La respuesta del perfil no contiene datos válidos.");
  return {
    userId: readText(data.userId),
    email: readNullableText(data.email),
    displayName: readNullableText(data.displayName),
    avatarUrl: readNullableUrl(data.avatarUrl),
    version: readVersion(data.version),
  };
}

function readVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("La versión del perfil no es válida.");
  return value as number;
}

function readApiError(payload: unknown): string {
  const envelope = readRecord(payload, "No se pudo obtener el perfil.");
  const error = envelope.error && typeof envelope.error === "object" ? envelope.error as Record<string, unknown> : null;
  return error && typeof error.message === "string" ? error.message : "No se pudo obtener el perfil.";
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function readText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("El perfil contiene texto inválido.");
  return value.trim();
}

function readNullableText(value: unknown): string | null {
  if (value === null) return null;
  return readText(value);
}

function readNullableUrl(value: unknown): string | null {
  if (value === null) return null;
  const url = new URL(readText(value));
  if (url.protocol !== "https:") throw new Error("El avatar del perfil no es válido.");
  return url.toString();
}
