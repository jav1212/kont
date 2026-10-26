"use client";

import { AccountingMasterPage } from "@/src/modules/accounting/frontend/components/accounting-master-page";

/** Lists and creates company-scoped charts of accounts.
 * @returns The accounting chart catalog.
 * @throws Never; request failures appear in the page.
 */
export default function AccountingChartsPage(): React.JSX.Element {
  return <AccountingMasterPage title="Planes de cuentas" description="Administra los planes de la empresa y activa el plan que utilizarán sus operaciones contables." query={{ kind: "list_charts" }} columns={[{ key: "name", label: "Plan" }, { key: "status", label: "Estado" }, { key: "version", label: "Versión" }]} rowActions={[{ label: "Activar", kind: "activate_chart", fields: { chartId: "id", expectedVersion: "version" } }, { label: "Archivar", kind: "archive_chart", fields: { chartId: "id", expectedVersion: "version" } }]} command="create_chart" idField="chartId" fields={[{ name: "name", label: "Nombre del plan" }]} commandDefaults={{ structure: { segments: [{ length: 1, separator: null }, { length: 1, separator: "." }, { length: 2, separator: "." }, { length: 2, separator: "." }, { length: 3, separator: "." }] }, source: { kind: "empty" } }} />;
}
