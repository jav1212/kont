import { shell } from "electron";
import type { DesktopExternalDestination, DesktopExternalNavigationResult } from "../../shared/desktop-api.js";

const DESTINATION_PATHS: Readonly<Record<DesktopExternalDestination, string>> = {
  settings: "/settings/members",
  profile: "/profile",
  help: "/help",
  billing: "/settings/billing",
  status: "/tools/status",
};

export class DesktopExternalNavigation {
  constructor(private readonly baseUrl: string) {}

  async open(input: unknown): Promise<DesktopExternalNavigationResult> {
    if (!isDestination(input)) return { ok: false, error: { message: "El destino solicitado no es válido." } };
    const url = new URL(DESTINATION_PATHS[input], this.baseUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
      return { ok: false, error: { message: "El destino solicitado no es seguro." } };
    }
    try {
      await shell.openExternal(url.toString());
      return { ok: true };
    } catch {
      return { ok: false, error: { message: "No se pudo abrir el destino en el navegador." } };
    }
  }
}

function isDestination(value: unknown): value is DesktopExternalDestination {
  return typeof value === "string" && Object.hasOwn(DESTINATION_PATHS, value);
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
