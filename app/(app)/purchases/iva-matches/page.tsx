import { permanentRedirect } from "next/navigation";

/** Redirects the former IVA matches screen to the fiscal pending list.
 * @param input - Query parameters captured from the legacy route.
 * @returns A permanent redirect to fiscal pending items.
 */
export default async function IvaMatchesRedirect({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<never> {
  const values = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  permanentRedirect(`/fiscal/pendientes${params.size ? `?${params}` : ""}`);
}
