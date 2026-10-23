import { PayablesReportWorkspace } from "@/src/modules/payables/frontend/payables-report-workspace";

/** Summarizes outstanding balances by supplier.
 * @returns The supplier balance report.
 */
export default function PayablesSuppliersPage(): React.JSX.Element {
  return <PayablesReportWorkspace mode="suppliers" title="Saldos por proveedor" description="Saldo abierto agrupado por proveedor y moneda." />;
}
