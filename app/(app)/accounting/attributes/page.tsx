import { AccountingMasterPage } from "@/src/modules/accounting/frontend/components/accounting-master-page";

/** Defines typed attributes that detail accounts may request on future entries.
 * @returns The accounting attribute catalog.
 * @throws Never; request failures appear in the page.
 */
export default function AccountingAttributesPage(): React.JSX.Element {
  return <AccountingMasterPage title="Atributos contables" description="Define datos adicionales que pueden asociarse a cuentas de detalle." query={{ kind: "list_accounting_attributes" }} columns={[{ key: "code", label: "Código" }, { key: "name", label: "Atributo" }, { key: "data_type", label: "Tipo" }, { key: "is_active", label: "Activo" }]} command="upsert_accounting_attribute" idField="attributeId" fields={[{ name: "code", label: "Código" }, { name: "name", label: "Nombre" }, { name: "dataType", label: "Tipo", values: ["text", "number", "date", "boolean", "option"] }]} />;
}
