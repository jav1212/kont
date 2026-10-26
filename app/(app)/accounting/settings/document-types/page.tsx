import { AccountingMasterPage } from "@/src/modules/accounting/frontend/components/accounting-master-page";

/** Manages accounting document types while retaining their numbering settings.
 * @returns The company document type catalog.
 * @throws Never; request failures appear in the page.
 */
export default function AccountingDocumentTypesPage(): React.JSX.Element {
  return <AccountingMasterPage title="Tipos de comprobante" description="Configura los tipos de comprobante y su numeración inicial." query={{ kind: "list_document_types" }} columns={[{ key: "code", label: "Código" }, { key: "name", label: "Nombre" }, { key: "prefix", label: "Prefijo" }, { key: "next_number", label: "Próximo número" }, { key: "is_system", label: "Sistema" }]} command="upsert_document_type" idField="documentTypeId" fields={[{ name: "code", label: "Código" }, { name: "name", label: "Nombre" }, { name: "prefix", label: "Prefijo" }]} />;
}
