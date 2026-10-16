"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatCompanyDate, type CompanyDateOrder } from "@kontave/companies/domain";
import { useCompany } from "../hooks/use-companies";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";

interface CompanyDateFormatContextValue {
  readonly dateOrder: CompanyDateOrder | null;
  readonly loading: boolean;
  readonly formatDate: (isoDate: string) => string;
  readonly reload: () => Promise<void>;
}

const CompanyDateFormatContext = createContext<CompanyDateFormatContextValue | null>(null);

/**
 * Loads the selected company's explicit date display preference for Web consumers.
 * @param props - Business subtree rendered inside the active company context.
 * @returns A provider for strict date-only formatting without timezone conversion.
 * @throws No error is thrown to consumers when an initial read fails; Web falls back to Venezuelan order.
 */
export function CompanyDateFormatProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { companyId } = useCompany();
  const requestRevision = useRef(0);
  const [dateOrder, setDateOrder] = useState<CompanyDateOrder | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    const requestId = ++requestRevision.current;
    if (!companyId) { setDateOrder(null); setLoading(false); return; }
    setLoading(true);
    try {
      const response = await apiFetch(`/api/companies/date-format?companyId=${encodeURIComponent(companyId)}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "No fue posible consultar el formato de fecha.");
      if (requestRevision.current === requestId) setDateOrder((payload.data?.dateOrder as CompanyDateOrder | undefined) ?? null);
    } finally { if (requestRevision.current === requestId) setLoading(false); }
  }, [companyId]);

  useEffect(() => { void reload().catch(() => setDateOrder(null)); }, [reload]);

  const formatDate = useCallback((isoDate: string) => {
    try { return formatCompanyDate(isoDate, dateOrder ?? "day_first"); }
    catch { return isoDate; }
  }, [dateOrder]);
  const value = useMemo(() => ({ dateOrder, loading, formatDate, reload }), [dateOrder, loading, formatDate, reload]);

  return <CompanyDateFormatContext.Provider value={value}>{children}</CompanyDateFormatContext.Provider>;
}

/**
 * Returns the active company's date preference and a strict civil-date formatter.
 * @returns Current format order, loading status, formatter, and reload command.
 * @throws {Error} When used outside CompanyDateFormatProvider.
 */
export function useCompanyDateFormat(): CompanyDateFormatContextValue {
  const context = useContext(CompanyDateFormatContext);
  if (!context) throw new Error("useCompanyDateFormat must be used inside CompanyDateFormatProvider.");
  return context;
}
