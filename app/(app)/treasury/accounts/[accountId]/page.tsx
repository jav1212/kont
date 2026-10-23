"use client";

import { useParams } from "next/navigation";
import { TreasuryWorkspace } from "@/src/modules/treasury/frontend/pages/treasury-workspace";

/**
 * Shows the selected Treasury account.
 *
 * @returns The account detail workspace.
 */
export default function TreasuryAccountDetailPage(): React.JSX.Element {
  const params = useParams<{ accountId: string }>();
  return <TreasuryWorkspace kind="account" accountId={params.accountId} />;
}
