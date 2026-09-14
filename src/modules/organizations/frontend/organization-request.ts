import { z } from "zod";

const errorSchema = z.object({ error: z.union([z.string(), z.object({ message: z.string() })]) });
const retryableErrorSchema = errorSchema.extend({ code: z.literal("ORGANIZATION_REPOSITORY_UNAVAILABLE") });
const ORGANIZATION_READ_RETRY_DELAYS_MS = [250, 500] as const;

function abortReason(signal: AbortSignal | null | undefined): unknown {
  return signal?.reason ?? new DOMException("La solicitud de organización fue cancelada.", "AbortError");
}

function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}

function waitForOrganizationRetry(delayMs: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancelWait);
      resolve();
    }, delayMs);
    const cancelWait = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancelWait);
      reject(abortReason(signal));
    };
    signal?.addEventListener("abort", cancelWait, { once: true });
  });
}

function canRetryOrganizationRead(response: Response, payload: unknown, options: RequestInit | undefined): boolean {
  const method = options?.method?.toUpperCase() ?? "GET";
  return method === "GET"
    && response.status === 503
    && retryableErrorSchema.safeParse(payload).success;
}

/**
 * Calls the cookie-authenticated organization API and validates its response.
 *
 * @param path - Organization endpoint on this Web application's origin.
 * @param schema - Runtime decoder owned by the response contract.
 * @param options - Fetch options, including an optional cancellation signal and explicit tenant scope.
 * @returns Validated data from the API envelope.
 * @throws Error when authentication, authorization, transport, cancellation, or decoding fails.
 * @remarks GET requests retry up to twice after the specific transient
 * ORGANIZATION_REPOSITORY_UNAVAILABLE response; writes and all other failures do not retry.
 */
export async function organizationRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<T> {
  if (path !== "/api/organizations" && !path.startsWith("/api/organizations/")) {
    throw new Error("Ruta de organización no válida.");
  }
  const headers = new Headers(options?.headers);
  const tenantId = typeof window === "undefined" ? null : localStorage.getItem("kont-active-tenant-id");
  if (tenantId && !headers.has("X-Tenant-Id")) headers.set("X-Tenant-Id", tenantId);
  let response: Response | null = null;
  let payload: unknown = null;
  for (let attempt = 0; attempt <= ORGANIZATION_READ_RETRY_DELAYS_MS.length; attempt += 1) {
    throwIfAborted(options?.signal);
    response = await fetch(path, { ...options, headers, cache: "no-store" });
    payload = await response.json().catch(() => null);
    throwIfAborted(options?.signal);
    if (!canRetryOrganizationRead(response, payload, options) || attempt === ORGANIZATION_READ_RETRY_DELAYS_MS.length) break;
    await waitForOrganizationRetry(ORGANIZATION_READ_RETRY_DELAYS_MS[attempt], options?.signal);
  }
  if (!response) throw new Error("No se pudo consultar la organización.");
  if (!response.ok) {
    const parsed = errorSchema.safeParse(payload);
    const error = parsed.success ? parsed.data.error : null;
    throw new Error(typeof error === "string" ? error : error?.message ?? "No se pudo consultar la organización.");
  }
  const result = z.object({ data: schema }).safeParse(payload);
  if (!result.success) throw new Error("La respuesta de la organización no es válida.");
  return result.data.data;
}
