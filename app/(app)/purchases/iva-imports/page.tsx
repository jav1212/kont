import { permanentRedirect } from "next/navigation";

/** Redirects the former IVA imports form to the fiscal workspace.
 * @param input - Query parameters captured from the legacy route.
 * @returns A permanent redirect to fiscal imports.
 */
export default async function IvaImportsRedirect({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<never> {
  const values = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  permanentRedirect(`/fiscal/importaciones${params.size ? `?${params}` : ""}`);
}
