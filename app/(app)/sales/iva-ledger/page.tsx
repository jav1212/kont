import { permanentRedirect } from "next/navigation";

/** Redirects the legacy sales IVA ledger while preserving search parameters.
 * @param input - Query parameters captured from the legacy route.
 * @returns A permanent redirect to the fiscal sales ledger.
 */
export default async function SalesIvaLedgerRedirect({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<never> {
  const values = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  permanentRedirect(`/fiscal/ventas${params.size ? `?${params}` : ""}`);
}
