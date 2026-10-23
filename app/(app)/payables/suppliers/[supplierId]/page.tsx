import { PayablesSupplierStatement } from "@/src/modules/payables/frontend/payables-supplier-statement";

/** Shows a supplier statement with opening, running and closing balances.
 * @param props - Route parameters containing the supplier identifier.
 * @returns The supplier statement page.
 */
export default async function PayablesSupplierPage({ params }: { readonly params: Promise<{ readonly supplierId: string }> }): Promise<React.JSX.Element> {
  const { supplierId } = await params;
  return <PayablesSupplierStatement supplierId={decodeURIComponent(supplierId)} />;
}
