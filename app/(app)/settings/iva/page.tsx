import { permanentRedirect } from "next/navigation";

/** Redirects the legacy IVA settings route while retaining search parameters.
 * @param input - Query parameters captured from the legacy route.
 * @returns A permanent redirect to fiscal configuration.
 */
export default async function IvaSettingsRedirect({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<never> {
  const values = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  permanentRedirect(`/fiscal/configuracion${params.size ? `?${params}` : ""}`);
}
