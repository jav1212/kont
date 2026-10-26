import { redirect } from "next/navigation";

/** Sends the legacy account route to the replacement chart catalog.
 * @returns Never; Next.js completes a redirect response.
 * @throws Never; redirect is represented by Next.js control flow.
 */
export default function AccountingAccountsPage(): never {
  redirect("/accounting/charts");
}
