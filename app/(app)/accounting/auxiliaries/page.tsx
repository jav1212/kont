import { AccountingMasterPage } from "@/src/modules/accounting/frontend/components/accounting-master-page";

/** Lists enabled third-party projections and accounting-owned other auxiliaries.
 * @returns The auxiliary directory.
 * @throws Never; request failures appear in the page.
 */
export default function AccountingAuxiliariesPage(): React.JSX.Element {
  return <AccountingMasterPage title="Auxiliares contables" description="Consulta terceros de clientes, proveedores, empleados y beneficiarios; crea auxiliares propios cuando haga falta." query={{ kind: "list_auxiliaries", auxiliaryType: "other" }} columns={[{ key: "code", label: "Código" }, { key: "name", label: "Auxiliar" }, { key: "type", label: "Tipo" }, { key: "isActive", label: "Activo" }]} rowActions={[{ label: "Cambiar estado", kind: "set_other_auxiliary_active", fields: { auxiliaryId: "id", expectedVersion: "version" }, toggleField: "isActive" }]} command="upsert_other_auxiliary" idField="auxiliaryId" fields={[{ name: "code", label: "Código" }, { name: "name", label: "Nombre" }]} additionalCommands={[{ title: "Activar fuente de terceros", command: "set_auxiliary_source_enabled", idField: "auxiliaryType", fields: [{ name: "auxiliaryType", label: "Fuente", values: ["customer", "supplier", "employee", "beneficiary"] }, { name: "isEnabled", label: "Estado", values: ["true", "false"] }] }]} />;
}
