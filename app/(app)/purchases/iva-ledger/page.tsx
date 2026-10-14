import { IvaLedgerView } from "@/app/(app)/fiscal/iva-ledger-view";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";

/** Opens the purchase VAT ledger and read-only legacy-source review.
 * @returns The company-scoped purchase VAT view.
 */
export default function PurchaseIvaLedgerPage(): React.JSX.Element {
  return <>
    <div className="border-b border-border-light bg-surface-1 px-4 py-3 md:px-8">
      <Link href="/purchases/iva-imports" className="text-sm font-semibold text-primary-500 hover:underline">Registrar evidencia de importación →</Link>
      <span className="mx-3 text-[var(--text-tertiary)]">·</span>
      <Link href="/purchases/iva-matches" className="text-sm font-semibold text-primary-500 hover:underline">Conciliar factura recibida →</Link>
      <span className="mx-3 text-[var(--text-tertiary)]">·</span>
      <Link href="/fiscal/iva-declarations" className="text-sm font-semibold text-primary-500 hover:underline">Ver y preparar borradores internos →</Link>
    </div>
    <IvaLedgerView direction="purchase" title="Libro IVA de Compras" />
  </>;
}
