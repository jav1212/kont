import { IvaLedgerView } from "@/app/(app)/fiscal/iva-ledger-view";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";

/** Opens the sales VAT ledger and read-only legacy-source review.
 * @returns The company-scoped sales VAT view.
 */
export default function SalesIvaLedgerPage(): React.JSX.Element {
  return <>
    <div className="border-b border-border-light bg-surface-1 px-4 py-3 md:px-8">
      <Link href="/fiscal/iva-declarations" className="text-sm font-semibold text-primary-500 hover:underline">Ver y preparar borradores internos →</Link>
    </div>
    <IvaLedgerView direction="sale" title="Libro IVA de Ventas" />
  </>;
}
