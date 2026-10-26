import { AccountingMasterPage } from "@/src/modules/accounting/frontend/components/accounting-master-page";

/** Displays the versioned functional and reporting currency configuration.
 * @returns The accounting currency settings snapshot.
 * @throws Never; request failures appear in the page.
 */
export default function AccountingCurrenciesPage(): React.JSX.Element {
  return <AccountingMasterPage title="Monedas contables" description="La moneda funcional del libro es VES; las monedas de reporte quedan guardadas en revisiones de configuración." query={{ kind: "get_accounting_settings" }} columns={[{ key: "version", label: "Revisión" }, { key: "functionalCurrency", label: "Moneda funcional" }, { key: "reportingCurrencies", label: "Monedas de reporte" }]} />;
}
