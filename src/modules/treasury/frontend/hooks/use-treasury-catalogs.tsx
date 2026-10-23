"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TreasuryPageDto, TreasuryQueryRequest, TreasuryReadRow } from "@kontave/client-contracts";
import type { TreasuryBankAccountRow, TreasuryBankRow, TreasuryBeneficiaryRow, TreasuryCashBoxRow, TreasuryCheckbookRow } from "../treasury-rows";
import { useTreasuryContext } from "../context/treasury-context";

export interface TreasuryCatalogs {
  readonly accounts: readonly (TreasuryBankAccountRow | TreasuryCashBoxRow)[];
  readonly banks: readonly TreasuryBankRow[];
  readonly beneficiaries: readonly TreasuryBeneficiaryRow[];
  readonly checkbooks: readonly TreasuryCheckbookRow[];
}

const EMPTY: TreasuryCatalogs = { accounts: [], banks: [], beneficiaries: [], checkbooks: [] };
type CatalogValue = TreasuryCatalogs & { readonly loading: boolean; readonly error: string | null; readonly refresh: () => Promise<void> };
const CatalogContext = createContext<CatalogValue | null>(null);

/** Loads shared Treasury catalogs once per workspace and refreshes them after catalog writes.
 * @returns Catalog rows with masked bank details, loading state, error, and refresh command.
 */
export function TreasuryCatalogsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { query, catalogRevision } = useTreasuryContext();
  const [catalogs, setCatalogs] = useState<TreasuryCatalogs>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null); setCatalogs(EMPTY);
    try {
      const [cashBoxes, bankAccounts, banks, beneficiaries, checkbooks] = await Promise.all([
        readAll<TreasuryCashBoxRow>(query, "list_cash_boxes"),
        readAll<TreasuryBankAccountRow>(query, "list_bank_accounts"),
        readAll<TreasuryBankRow>(query, "list_banks"),
        readAll<TreasuryBeneficiaryRow>(query, "list_beneficiaries"),
        readAll<TreasuryCheckbookRow>(query, "list_checkbooks"),
      ]);
      setCatalogs({ accounts: [...cashBoxes, ...bankAccounts], banks, beneficiaries, checkbooks });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los catálogos de Tesorería.");
    } finally { setLoading(false); }
  }, [query]);
  useEffect(() => { void refresh(); }, [catalogRevision, refresh]);
  const value = useMemo(() => ({ ...catalogs, loading, error, refresh }), [catalogs, loading, error, refresh]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

/** Reads the workspace-shared catalogs loaded by the Treasury route layout.
 * @returns Accounts, banks, beneficiaries, checkbooks, loading and refresh state.
 * @throws Error when used outside TreasuryCatalogsProvider.
 */
export function useTreasuryCatalogs(): CatalogValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useTreasuryCatalogs requiere TreasuryCatalogsProvider.");
  return value;
}

async function readAll<T extends TreasuryReadRow>(query: <Row extends TreasuryReadRow>(request: TreasuryQueryRequest) => Promise<Omit<TreasuryPageDto, "items"> & { readonly items: readonly Row[] }>, kind: TreasuryQueryRequest["kind"]): Promise<readonly T[]> {
  const request = (page: number): TreasuryQueryRequest => ({ kind, page, pageSize: 500 } as TreasuryQueryRequest);
  const first = await query<T>(request(1));
  if (first.total > 10_000) throw new Error(`El catálogo ${kind} supera el límite de 10.000 filas.`);
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) {
    const next = await query<T>(request(page));
    if (next.total !== first.total) throw new Error(`El catálogo ${kind} cambió mientras se cargaba. Actualiza la vista.`);
    if (!next.items.length) break;
    items.push(...next.items);
  }
  if (items.length < first.total) throw new Error(`No se pudo completar el catálogo ${kind}.`);
  return items;
}
