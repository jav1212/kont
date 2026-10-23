import { PayablesReconciliation } from "@/src/modules/payables/frontend/payables-reconciliation";

/** Payment-to-journal reconciliation (CXP-031).
 * @returns The reconciliation page.
 */
export default function PayablesReconciliationPage(): React.JSX.Element {
  return <PayablesReconciliation />;
}
