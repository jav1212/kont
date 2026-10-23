import { PayablesReportWorkspace } from "@/src/modules/payables/frontend/payables-report-workspace";

/** Lists outstanding supplier documents.
 * @returns The open document report.
 */
export default function PayablesDocumentsPage(): React.JSX.Element {
  return <PayablesReportWorkspace mode="documents" title="Documentos" description="Facturas, notas, ajustes, giros y saldos iniciales de proveedores." />;
}
