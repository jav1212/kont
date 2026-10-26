import { AccountingMasterPage } from "@/src/modules/accounting/frontend/components/accounting-master-page";

/** Displays the accounting profile from the latest immutable company revision.
 * @returns The accounting company profile snapshot.
 * @throws Never; request failures appear in the page.
 */
export default function AccountingCompanySettingsPage(): React.JSX.Element {
  return <AccountingMasterPage title="Perfil contable de la empresa" description="Consulta los datos del contador, CPC, registro mercantil e inicio del ejercicio guardados en la última revisión." query={{ kind: "get_accounting_settings" }} columns={[{ key: "version", label: "Revisión" }, { key: "profile", label: "Perfil" }]} />;
}
