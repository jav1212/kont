"use client";

import { BaseTable, type Column } from "@/src/shared/frontend/components/base-table";

/** Renders company-scoped fiscal rows with the shared searchable table.
 * @param props - Columns, rows, and a stable identity selector.
 * @returns Searchable, paginated fiscal ledger table.
 */
export function LedgerTable<T extends object>({ columns, rows, keyExtractor, emptyContent = "No hay documentos en este período." }: { readonly columns: Column<T>[]; readonly rows: readonly T[]; readonly keyExtractor: (row: T, index: number) => string | number; readonly emptyContent?: React.ReactNode }): React.JSX.Element {
  return <div className="overflow-x-auto rounded-xl border border-border-light bg-surface-1"><BaseTable.Render columns={columns} data={[...rows]} keyExtractor={keyExtractor} enableSearch pagination={{ defaultPageSize: 25 }} emptyContent={emptyContent} /></div>;
}
