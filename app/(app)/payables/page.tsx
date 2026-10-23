import { PayablesReportWorkspace } from "@/src/modules/payables/frontend/payables-report-workspace";

/** Shows the current open supplier obligations for the selected company.
 * @returns The Accounts Payable overview.
 */
export default function PayablesPage(): React.JSX.Element {
  return <PayablesReportWorkspace mode="dashboard" title="Cuentas por pagar" description="Obligaciones abiertas registradas desde compras y documentos de proveedores." />;
}
