import type { ReactNode } from "react";
import { TreasuryClientProvider } from "@/src/modules/treasury/frontend/context/treasury-context";
import { TreasuryCatalogsProvider } from "@/src/modules/treasury/frontend/hooks/use-treasury-catalogs";

/** Wraps Treasury routes with one authenticated client and shared command invalidation boundary.
 * @param props - Treasury route content.
 * @returns The Treasury workspace provider around its pages.
 */
export default function TreasuryLayout({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <TreasuryClientProvider><TreasuryCatalogsProvider>{children}</TreasuryCatalogsProvider></TreasuryClientProvider>;
}
