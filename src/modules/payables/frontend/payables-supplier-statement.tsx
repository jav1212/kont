"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { formatPayablesAmount, PAYABLE_APPLICATION_LABELS, PAYABLE_KIND_LABELS, payablesToday } from "./payables-client";
import { exportPayablesCsv, exportPayablesPdf, type PayablesExportColumn } from "./payables-export";
import { usePayablesReport } from "./use-payables-report";

interface Movement { readonly date: string; readonly movementType: string; readonly detail: string; readonly documentId: string; readonly documentNumber: string; readonly description: string; readonly currency: string; readonly amount: string; readonly balance: string }
const CONTROL = "rounded-lg border border-default-300 bg-background px-3 py-2 text-sm";
const MOVEMENT_LABELS: Readonly<Record<string, string>> = { document: "Documento", void: "Anulación", application: "Aplicación", reversal: "Reverso" };

/** Supplier statement (CXP-005): chronological movements per currency with opening, running and closing balances.
 * The closing balance equals the supplier balance at the same date (CXP-006).
 * @param props - Supplier identifier from the route.
 * @returns The statement with CSV/PDF export of the same rows.
 */
export function PayablesSupplierStatement({ supplierId }: { readonly supplierId: string }): React.JSX.Element {
  const { company } = useCompany();
  const today = payablesToday();
  const [range, setRange] = useState({ from: `${today.slice(0, 4)}-01-01`, to: today, currency: "" });
  const query = useMemo(() => ({ kind: "supplier_statement", supplierId, from: range.from, to: range.to, ...(range.currency ? { currency: range.currency } : {}) }), [supplierId, range]);
  const statement = usePayablesReport<Movement>(query);
  const supplier = usePayablesReport<{ readonly id: string; readonly name: string; readonly rif: string }>({ kind: "suppliers", limit: 200 });
  const name = supplier.data?.rows.find((row) => row.id === supplierId)?.name ?? supplierId;
  const rows = statement.data?.rows ?? [];
  const columns: readonly PayablesExportColumn<Movement>[] = [
    { header: "Fecha", value: (row) => row.date }, { header: "Movimiento", value: (row) => MOVEMENT_LABELS[row.movementType] ?? row.movementType },
    { header: "Detalle", value: (row) => PAYABLE_APPLICATION_LABELS[row.detail] ?? PAYABLE_KIND_LABELS[row.detail] ?? row.detail }, { header: "Documento", value: (row) => row.documentNumber },
    { header: "Moneda", value: (row) => row.currency }, { header: "Importe", value: (row) => row.amount, numeric: true }, { header: "Saldo", value: (row) => row.balance, numeric: true },
  ];
  const subtitle = `${company?.name ?? ""} · ${name} · ${range.from} a ${range.to}`;
  return <main className="mx-auto max-w-7xl space-y-6 p-6">
    <header className="space-y-2"><Link className="text-sm text-primary underline" href="/payables/suppliers">Saldos por proveedor</Link><h1 className="text-3xl font-semibold">Estado de cuenta · {name}</h1></header>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-sm">Desde<input type="date" className={CONTROL} value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label>
        <label className="grid gap-1 text-sm">Hasta<input type="date" className={CONTROL} value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label>
        <label className="grid gap-1 text-sm">Moneda<select className={CONTROL} value={range.currency} onChange={(event) => setRange({ ...range, currency: event.target.value })}><option value="">Todas</option><option>VES</option><option>USD</option><option>EUR</option></select></label>
      </div>
      <div className="flex gap-2">
        <button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" disabled={!rows.length} onClick={() => exportPayablesCsv(`estado-cuenta-${supplierId}`, columns, rows)}>CSV</button>
        <button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" disabled={!rows.length} onClick={() => void exportPayablesPdf(`estado-cuenta-${supplierId}`, "Estado de cuenta de proveedor", subtitle, columns, rows)}>PDF</button>
        <Link href={`/payables/payments?supplierId=${encodeURIComponent(supplierId)}`} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">Pagar</Link>
      </div>
    </div>
    {(statement.data?.totals ?? []).length > 0 && <section className="grid gap-3 sm:grid-cols-3">{(statement.data?.totals ?? []).map((total) => <div key={total.currency} className="rounded-xl border border-border-light bg-surface-1 p-4 text-sm"><p className="text-[var(--text-secondary)]">{total.currency}</p><p>Saldo inicial <span className="tabular-nums">{formatPayablesAmount(total.opening)}</span></p><p className="text-xl font-semibold">Saldo final <span className="tabular-nums">{formatPayablesAmount(total.closing)}</span></p></div>)}</section>}
    <section className="overflow-hidden rounded-xl border border-border-light bg-surface-1">
      {statement.error ? <p role="alert" className="p-5 text-danger">{statement.error}</p> : statement.loading ? <p className="p-5" role="status">Cargando…</p> : rows.length === 0 ? <p className="p-5 text-sm text-[var(--text-secondary)]">Sin movimientos en el rango.</p>
        : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{columns.map((column) => <th key={column.header} className={`border-b border-border-light px-4 py-3 font-medium ${column.numeric ? "text-right" : ""}`}>{column.header}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${row.documentId}:${index}`}>
            <td className="border-b border-border-light px-4 py-2">{row.date}</td><td className="border-b border-border-light px-4 py-2">{MOVEMENT_LABELS[row.movementType] ?? row.movementType}</td>
            <td className="border-b border-border-light px-4 py-2">{PAYABLE_APPLICATION_LABELS[row.detail] ?? PAYABLE_KIND_LABELS[row.detail] ?? row.detail}</td>
            <td className="border-b border-border-light px-4 py-2"><Link className="text-primary underline" href={`/payables/documents/${encodeURIComponent(row.documentId)}`}>{row.documentNumber || "Ver"}</Link></td>
            <td className="border-b border-border-light px-4 py-2">{row.currency}</td>
            <td className="border-b border-border-light px-4 py-2 text-right tabular-nums">{formatPayablesAmount(row.amount)}</td>
            <td className="border-b border-border-light px-4 py-2 text-right tabular-nums">{formatPayablesAmount(row.balance)}</td>
          </tr>)}</tbody></table></div>}
    </section>
  </main>;
}
