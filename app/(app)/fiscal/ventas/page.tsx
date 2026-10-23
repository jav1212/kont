import { IvaLedgerView } from "@/app/(app)/fiscal/iva-ledger-view";
import { ContextLink } from "@/src/shared/frontend/components/context-link";

/** Presents the sales IVA ledger in the fiscal workspace.
 * @returns The scoped sales ledger.
 */
export default function FiscalSalesLedgerPage(): React.JSX.Element {
  return <><div className="border-b border-border-light bg-surface-1 px-4 py-3 md:px-8"><ContextLink href="/fiscal/declaraciones" className="text-sm font-semibold text-primary-500 hover:underline">Declaraciones →</ContextLink></div><IvaLedgerView direction="sale" title="Libro de ventas" /></>;
}
