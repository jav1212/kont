"use client";

import type { ReactNode } from "react";
import { useCompany } from "../hooks/use-companies";

/** Compatibility boundary; selection is owned by WebApplicationProvider.
 * @param props - Content consuming the already initialized company context.
 * @returns Content without creating another selection store.
 * @throws Error when the global workspace provider is missing.
 */
export function CompanyProvider({ children }: { children: ReactNode }) {
    useCompany();
    return <>{children}</>;
}
