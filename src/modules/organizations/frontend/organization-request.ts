import { z } from "zod";

const errorSchema = z.object({ error: z.union([z.string(), z.object({ message: z.string() })]) });

/**
 * Calls the cookie-authenticated organization API and validates its response.
 *
 * @param path - Organization endpoint on this Web application's origin.
 * @param schema - Runtime decoder owned by the response contract.
 * @param options - Fetch options, including an optional cancellation signal and explicit tenant scope.
 * @returns Validated data from the API envelope.
 * @throws Error when authentication, authorization, transport, or decoding fails.
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
  const response = await fetch(path, { ...options, headers, cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(payload);
    const error = parsed.success ? parsed.data.error : null;
    throw new Error(typeof error === "string" ? error : error?.message ?? "No se pudo consultar la organización.");
  }
  const result = z.object({ data: schema }).safeParse(payload);
  if (!result.success) throw new Error("La respuesta de la organización no es válida.");
  return result.data.data;
}
