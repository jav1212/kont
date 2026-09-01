/**
 * Selects the development renderer URL eligible for privileged Desktop IPC.
 *
 * Packaged builds always ignore development overrides. Development accepts only
 * an HTTP(S) URL bound to this machine, preventing an environment override from
 * granting a remote document access to the preload bridge.
 * @param candidate - Optional URL supplied by the development environment.
 * @param isPackaged - Whether Electron is executing a packaged build.
 * @returns The canonical trusted development URL, or undefined when not applicable.
 * @throws Error when a development override is malformed or not loopback-bound.
 */
export function developmentRendererUrl(
  candidate: string | undefined,
  isPackaged: boolean,
): string | undefined {
  if (!candidate || isPackaged) return undefined;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("ELECTRON_RENDERER_URL debe ser una URL de desarrollo válida.");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !isLoopbackHost(url.hostname)
  )
    throw new Error("ELECTRON_RENDERER_URL debe apuntar a un origen loopback.");
  return url.toString();
}

/**
 * Determines whether a URL host is bound only to the local device.
 * @param hostname - URL hostname normalized by the WHATWG URL parser.
 * @returns Whether the host is a supported loopback name or address.
 */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
