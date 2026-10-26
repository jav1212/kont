import { AccountingMasterPage } from "@/src/modules/accounting/frontend/components/accounting-master-page";

/** Manages the company's analytical cost center tree.
 * @returns The cost center directory and create form.
 * @throws Never; request failures appear in the page.
 */
export default function CostCentersPage(): React.JSX.Element {
  return <AccountingMasterPage title="Centros de costo" description="Organiza los gastos por área y define jerarquías analíticas." query={{ kind: "list_cost_centers" }} columns={[{ key: "code", label: "Código" }, { key: "name", label: "Centro" }, { key: "parent_id", label: "Superior" }, { key: "is_active", label: "Activo" }]} command="create_cost_center" idField="costCenterId" fields={[{ name: "code", label: "Código" }, { name: "name", label: "Nombre" }, { name: "parentId", label: "ID del centro superior (opcional)" }]} />;
}
