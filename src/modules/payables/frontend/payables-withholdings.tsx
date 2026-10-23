"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { notify } from "@/src/shared/frontend/notify";
import { generateComprobanteIslrPdf } from "@/src/modules/purchases/frontend/utils/comprobante-islr-pdf";
import { generateComprobanteIvaPdf } from "@/src/modules/purchases/frontend/utils/comprobante-iva-pdf";
import { executePayablesCommand, formatPayablesAmount, payablesToday, queryPayables } from "./payables-client";
import { exportPayablesCsv, exportPayablesPdf, type PayablesExportColumn } from "./payables-export";
import { usePayablesReport, usePayablesScope } from "./use-payables-report";

interface Withholding { readonly id: string; readonly kind: "vat" | "islr"; readonly origin: "purchase" | "payment"; readonly supplierName: string | null; readonly supplierRif: string | null; readonly documentId: string; readonly documentNumber: string; readonly receiptNumber: string | null; readonly fiscalPeriod: string; readonly issuedAt: string; readonly amountVes: string; readonly status: string; readonly late: boolean; readonly paymentId: string | null }
interface Voucher {
  readonly kind: "vat" | "islr"; readonly receiptNumber: string; readonly fiscalPeriod: string; readonly issuedAt: string; readonly taxableBaseVes: string; readonly rate: string; readonly subtrahendVes: string; readonly taxUnitValue: string | null; readonly conceptCode: string | null; readonly amountVes: string;
  readonly supplier: { readonly name: string; readonly rif: string; readonly address: string | null }; readonly company: { readonly name: string; readonly rif: string; readonly address: string | null };
  readonly document: { readonly number: string; readonly issuedAt: string; readonly principalVes: string; readonly taxBaseVes: string | null; readonly vatAmountVes: string | null; readonly controlNumber: string | null };
}
const STATUS_LABELS: Readonly<Record<string, string>> = { issued: "Emitida", declared: "Declarada", voided: "Anulada" };
const CONTROL = "rounded-lg border border-default-300 bg-background px-3 py-2 text-sm";

/** Unified withholdings of both moments (CXP-024–027): imported from purchases and issued at payment.
 * Totals per period match the IVA TXT and ISLR XML sources.
 * @returns The withholdings page.
 */
export function PayablesWithholdings(): React.JSX.Element {
  const scope = usePayablesScope();
  const { company } = useCompany();
  const { can } = useOrganizationModuleAccess("/payables");
  const today = payablesToday();
  const [filters, setFilters] = useState({ withholdingKind: "vat", fiscalPeriod: today.slice(0, 7), status: "" });
  const [revision, setRevision] = useState(0);
  const period = filters.withholdingKind === "islr" ? filters.fiscalPeriod.slice(0, 4) : filters.fiscalPeriod;
  const query = useMemo(() => ({ kind: "withholdings", limit: 200, withholdingKind: filters.withholdingKind, fiscalPeriod: period, ...(filters.status ? { status: filters.status } : {}) }), [filters, period]);
  const report = usePayablesReport<Withholding>(query, revision);
  const rows = report.data?.rows ?? [];
  const columns: readonly PayablesExportColumn<Withholding>[] = [
    { header: "Comprobante", value: (row) => row.receiptNumber ?? "" }, { header: "Fecha", value: (row) => row.issuedAt }, { header: "Proveedor", value: (row) => row.supplierName ?? "" },
    { header: "RIF", value: (row) => row.supplierRif ?? "" }, { header: "Documento", value: (row) => row.documentNumber }, { header: "Origen", value: (row) => row.origin === "purchase" ? "Compra" : "Pago" },
    { header: "Monto Bs", value: (row) => row.amountVes, numeric: true }, { header: "Estado", value: (row) => STATUS_LABELS[row.status] ?? row.status },
  ];
  async function printVoucher(row: Withholding): Promise<void> {
    if (!scope) return;
    try {
      const voucher = (await queryPayables<Voucher>(scope, { kind: "withholding_voucher", withholdingId: row.id })).rows[0];
      if (!voucher) return;
      const common = { agent: { name: voucher.company.name, rif: voucher.company.rif, ...(voucher.company.address ? { address: voucher.company.address } : {}) }, supplier: { name: voucher.supplier.name, rif: voucher.supplier.rif, ...(voucher.supplier.address ? { address: voucher.supplier.address } : {}) },
        operation: { invoiceNumber: voucher.document.number, controlNumber: voucher.document.controlNumber ?? "", invoiceDate: voucher.document.issuedAt, period: voucher.issuedAt.slice(0, 7) }, voucherNumber: voucher.receiptNumber, issueDate: voucher.issuedAt };
      if (voucher.kind === "vat") {
        const ivaCaused = Number(voucher.taxableBaseVes);
        const base = Number(voucher.document.taxBaseVes ?? 0);
        await generateComprobanteIvaPdf({ ...common, amounts: { invoiceTotal: Number(voucher.document.principalVes), taxableBase: base, exemptBase: 0, ivaRate: base > 0 ? Math.round((ivaCaused / base) * 100) : 16, ivaCaused, retentionPct: Number(voucher.rate), retentionAmount: Number(voucher.amountVes) } });
      } else {
        await generateComprobanteIslrPdf({ ...common, retention: { conceptCode: voucher.conceptCode ?? "", operationAmount: Number(voucher.taxableBaseVes), percentage: Number(voucher.rate), sustraendo: Number(voucher.subtrahendVes), withheldAmount: Number(voucher.amountVes), ...(voucher.taxUnitValue ? { unidadTributaria: Number(voucher.taxUnitValue) } : {}) } });
      }
    } catch (cause: unknown) { notify.error(cause instanceof Error ? cause.message : "No se pudo generar el comprobante."); }
  }
  async function declare(): Promise<void> {
    if (!scope) return;
    try { await executePayablesCommand(scope, { kind: "mark_withholdings_declared", withholdingKind: filters.withholdingKind, fiscalPeriod: period }); notify.success("Retenciones del período marcadas como declaradas."); setRevision((value) => value + 1); }
    catch (cause: unknown) { notify.error(cause instanceof Error ? cause.message : "No se pudo marcar el período."); }
  }
  return <main className="mx-auto max-w-7xl space-y-6 p-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><p className="text-sm text-[var(--text-secondary)]">Cuentas por pagar</p><h1 className="text-3xl font-semibold">Retenciones</h1><p className="text-[var(--text-secondary)]">Retenciones registradas con la compra y emitidas al pagar, con su comprobante.</p></div>
      <div className="flex gap-2"><button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" disabled={!rows.length} onClick={() => exportPayablesCsv(`retenciones-${filters.withholdingKind}-${period}`, columns, rows)}>CSV</button><button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" disabled={!rows.length} onClick={() => void exportPayablesPdf(`retenciones-${filters.withholdingKind}-${period}`, `Retenciones de ${filters.withholdingKind === "vat" ? "IVA" : "ISLR"}`, `${company?.name ?? ""} · período ${period}`, columns, rows)}>PDF</button>
        {can("payables.authorize") && <button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" onClick={() => void declare()}>Marcar período como declarado</button>}</div></header>
    <section className="grid gap-3 rounded-xl border border-border-light bg-surface-1 p-4 sm:grid-cols-3">
      <label className="grid gap-1 text-sm">Impuesto<select className={CONTROL} value={filters.withholdingKind} onChange={(event) => setFilters({ ...filters, withholdingKind: event.target.value })}><option value="vat">IVA (período mensual)</option><option value="islr">ISLR (año fiscal)</option></select></label>
      <label className="grid gap-1 text-sm">Período<input type="month" className={CONTROL} value={filters.fiscalPeriod} onChange={(event) => setFilters({ ...filters, fiscalPeriod: event.target.value || today.slice(0, 7) })} /></label>
      <label className="grid gap-1 text-sm">Estado<select className={CONTROL} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option>{Object.entries(STATUS_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
    </section>
    {(report.data?.totals ?? []).map((total) => <p key={`${total.kind}:${total.fiscalPeriod}`} className="text-sm">Total {total.kind === "vat" ? "IVA" : "ISLR"} {total.fiscalPeriod}: <strong className="tabular-nums">{formatPayablesAmount(total.amountVes)} Bs</strong> (excluye anuladas; debe coincidir con el {total.kind === "vat" ? "TXT IVA" : "XML ISLR"} del período)</p>)}
    <section className="overflow-hidden rounded-xl border border-border-light bg-surface-1">
      {report.error ? <p role="alert" className="p-5 text-danger">{report.error}</p> : report.loading ? <p className="p-5" role="status">Cargando…</p> : rows.length === 0 ? <p className="p-5 text-sm text-[var(--text-secondary)]">Sin retenciones en el período.</p>
        : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{[...columns.map((column) => column.header), ""].map((label, index) => <th key={index} className="border-b border-border-light px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <td className="border-b border-border-light px-4 py-2 font-mono">{row.receiptNumber ?? "—"}</td><td className="border-b border-border-light px-4 py-2">{row.issuedAt}</td>
            <td className="border-b border-border-light px-4 py-2">{row.supplierName}</td><td className="border-b border-border-light px-4 py-2">{row.supplierRif}</td>
            <td className="border-b border-border-light px-4 py-2"><Link className="text-primary underline" href={`/payables/documents/${encodeURIComponent(row.documentId)}`}>{row.documentNumber || "Ver"}</Link></td>
            <td className="border-b border-border-light px-4 py-2">{row.origin === "purchase" ? "Compra" : "Pago"}{row.late && <span className="ml-1 text-xs text-danger">extemporánea</span>}</td>
            <td className="border-b border-border-light px-4 py-2 text-right tabular-nums">{formatPayablesAmount(row.amountVes)}</td>
            <td className="border-b border-border-light px-4 py-2">{STATUS_LABELS[row.status] ?? row.status}</td>
            <td className="border-b border-border-light px-4 py-2 text-right">{row.origin === "payment" && row.status !== "voided" ? <button type="button" className="text-primary underline" onClick={() => void printVoucher(row)}>Comprobante</button> : row.origin === "purchase" ? <span className="text-xs text-[var(--text-secondary)]">desde Compras</span> : null}</td>
          </tr>)}</tbody></table></div>}
    </section>
  </main>;
}
