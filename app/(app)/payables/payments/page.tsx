import { Suspense } from "react";
import { PayablesPayments } from "@/src/modules/payables/frontend/payables-payments";

/** Supplier payments and their history (CXP-016–023, CXP-028–030).
 * @returns The payments page.
 */
export default function PayablesPaymentsPage(): React.JSX.Element {
  return <Suspense fallback={<main className="p-6" role="status">Cargando…</main>}><PayablesPayments /></Suspense>;
}
