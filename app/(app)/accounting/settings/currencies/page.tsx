import { AccountingSettingsEditor } from "@/src/modules/accounting/frontend/components/accounting-settings-editor";

/** Displays the versioned functional and reporting currency configuration.
 * @returns The accounting currency settings snapshot.
 * @throws Never; request failures appear in the page.
 */
export default function AccountingCurrenciesPage(): React.JSX.Element {
  return <AccountingSettingsEditor section="currencies" />;
}
