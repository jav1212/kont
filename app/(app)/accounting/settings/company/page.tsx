import { AccountingSettingsEditor } from "@/src/modules/accounting/frontend/components/accounting-settings-editor";

/** Displays the accounting profile from the latest immutable company revision.
 * @returns The accounting company profile snapshot.
 * @throws Never; request failures appear in the page.
 */
export default function AccountingCompanySettingsPage(): React.JSX.Element {
  return <AccountingSettingsEditor section="profile" />;
}
