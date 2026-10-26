import { AccountingMasterPage } from "@/src/modules/accounting/frontend/components/accounting-master-page";

type Props = { params: Promise<{ chartId: string }> };

/** Shows one chart's account rows and accepts detail/group account creation.
 * @param props - Dynamic chart route parameters.
 * @returns The selected chart account list.
 * @throws Never; request failures appear in the page.
 */
export default async function AccountingChartDetailPage({ params }: Props): Promise<React.JSX.Element> {
  const { chartId } = await params;
  return <AccountingMasterPage title="Cuentas del plan" description={`Cuentas del plan ${chartId}. La estructura activa y los códigos jerárquicos se validan en el servidor.`} query={{ kind: "find_accounts", chartId }} columns={[{ key: "code", label: "Código" }, { key: "name", label: "Cuenta" }, { key: "kind", label: "Tipo de cuenta" }, { key: "type", label: "Clasificación" }, { key: "normalBalance", label: "Naturaleza" }, { key: "isActive", label: "Activa" }]} command="create_account" idField="accountId" fields={[{ name: "code", label: "Código" }, { name: "name", label: "Nombre" }, { name: "accountKind", label: "Tipo", values: ["detail", "summary"] }, { name: "accountType", label: "Clasificación", values: ["asset", "liability", "equity", "revenue", "expense"] }]} commandDefaults={{ chartId, isMemorandum: false, monetaryClass: null }} />;
}
