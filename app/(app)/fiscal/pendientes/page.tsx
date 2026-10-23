import { IvaLedgerView } from "@/app/(app)/fiscal/iva-ledger-view";

/** Displays legacy sources and reconciliation issues for both fiscal books.
 * @returns Read-only pending lists with explicit document-level review actions.
 */
export default function FiscalPendingPage(): React.JSX.Element {
  return <main className="min-h-full space-y-8 bg-surface-2 p-4 md:p-8"><header><h1 className="text-2xl font-semibold">Pendientes</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Fuentes heredadas sin incorporar y documentos que requieren revisión. No se incorpora ningún documento automáticamente.</p></header><section><h2 className="mb-3 text-lg font-semibold">Compras</h2><IvaLedgerView direction="purchase" title="Pendientes de compras" initialMode="sources" /></section><section><h2 className="mb-3 text-lg font-semibold">Ventas</h2><IvaLedgerView direction="sale" title="Pendientes de ventas" initialMode="sources" /></section></main>;
}
