import { AccountingMasterPage } from "@/src/modules/accounting/frontend/components/accounting-master-page";

/** Links expense classifications to active detail accounts.
 * @returns The expense classification catalog.
 * @throws Never; request failures appear in the page.
 */
export default function ExpenseClassesPage(): React.JSX.Element {
  return <AccountingMasterPage title="Clasificaciones de gasto" description="Asocia cada clasificación con una cuenta de gasto de detalle." query={{ kind: "list_expense_classes" }} columns={[{ key: "code", label: "Código" }, { key: "name", label: "Clasificación" }, { key: "account_id", label: "Cuenta" }, { key: "is_active", label: "Activa" }]} command="upsert_expense_class" idField="expenseClassId" fields={[{ name: "code", label: "Código" }, { name: "name", label: "Nombre" }, { name: "accountId", label: "ID de cuenta de gasto" }]} />;
}
