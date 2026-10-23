import { IvaLedgerView } from "@/app/(app)/fiscal/iva-ledger-view";
import { ContextLink } from "@/src/shared/frontend/components/context-link";

/** Presents the purchase IVA ledger in the fiscal workspace.
 * @returns The scoped purchase ledger and fiscal navigation.
 */
export default function FiscalPurchasesLedgerPage(): React.JSX.Element {
  return <><div className="border-b border-border-light bg-surface-1 px-4 py-3 md:px-8"><ContextLink href="/fiscal/importaciones" className="text-sm font-semibold text-primary-500 hover:underline">Importaciones →</ContextLink><span className="mx-3 text-[var(--text-tertiary)]">·</span><ContextLink href="/fiscal/pendientes" className="text-sm font-semibold text-primary-500 hover:underline">Pendientes →</ContextLink><span className="mx-3 text-[var(--text-tertiary)]">·</span><ContextLink href="/fiscal/declaraciones" className="text-sm font-semibold text-primary-500 hover:underline">Declaraciones →</ContextLink></div><IvaLedgerView direction="purchase" title="Libro de compras" /></>;
}
