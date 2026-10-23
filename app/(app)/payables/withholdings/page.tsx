import { PayablesWithholdings } from "@/src/modules/payables/frontend/payables-withholdings";

/** Unified withholdings with receipts (CXP-024–027).
 * @returns The withholdings page.
 */
export default function PayablesWithholdingsPage(): React.JSX.Element {
  return <PayablesWithholdings />;
}
