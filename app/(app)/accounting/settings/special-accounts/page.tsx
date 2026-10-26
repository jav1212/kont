import { AccountingMasterPage } from "@/src/modules/accounting/frontend/components/accounting-master-page";

/** Assigns the special accounts used by year-end accounting processes.
 * @returns The current role mapping and assignment form.
 * @throws Never; request failures appear in the page.
 */
export default function AccountingSpecialAccountsPage(): React.JSX.Element {
  return <AccountingMasterPage title="Cuentas especiales" description="Asigna cuentas de detalle para cierre, resultados y ajustes contables." query={{ kind: "get_accounting_settings" }} columns={[{ key: "version", label: "Revisión" }, { key: "specialAccounts", label: "Roles asignados" }]} command="set_special_account" fields={[{ name: "role", label: "Rol", values: ["net_income", "retained_earnings", "income_closing", "expense_closing", "fiscal_inflation", "financial_rei", "exchange_difference"] }, { name: "accountId", label: "ID de cuenta" }]} />;
}
