import { AccountingMasterPage } from "@/src/modules/accounting/frontend/components/accounting-master-page";

type Props = { params: Promise<{ accountId: string }> };

/** Reads one account's classification, hierarchy, and analytical policies.
 * @param props - Dynamic account route parameters.
 * @returns Account detail and reference counts.
 * @throws Never; request failures appear in the page.
 */
export default async function AccountingAccountDetailPage({ params }: Props): Promise<React.JSX.Element> {
  const { accountId } = await params;
  return <AccountingMasterPage title="Ficha de cuenta" description="Clasificación, naturaleza, referencias y dimensiones asociadas a la cuenta." query={{ kind: "get_account", accountId }} columns={[{ key: "account", label: "Cuenta" }, { key: "references", label: "Referencias" }]} />;
}
