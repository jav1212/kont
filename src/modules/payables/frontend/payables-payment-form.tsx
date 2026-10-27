"use client";

import { useMemo, useState } from "react";
import { addDecimal, compareDecimal, exactDecimal } from "@kontave/monetary/domain";
import { listIslrConceptsForPurchases } from "@kontave/taxation/venezuela";
import { ResponsiveDrawer } from "@/src/shared/frontend/components/responsive-drawer";
import { notify } from "@/src/shared/frontend/notify";
import { executePayablesCommand, formatPayablesAmount, newPayablesId, PAYABLE_KIND_LABELS, payablesToday, type PayablesRequestScope } from "./payables-client";
import { usePayablesReport } from "./use-payables-report";

interface Account { readonly kind: "cash_box" | "bank_account"; readonly id: string; readonly name: string; readonly currency: string; readonly checkbooks: readonly { readonly id: string; readonly nextNumber: string; readonly lastNumber: string }[] }
interface OpenDocument { readonly documentId: string; readonly documentNumber: string; readonly kind: string; readonly side: string; readonly dueAt: string; readonly currency: string; readonly balance: string; readonly approvalStatus: string }
interface Supplier { readonly id: string; readonly name: string; readonly rif: string; readonly vatWithholdingRate: string | null }
/** Batch being executed: its supplier, currency and reserved items are fixed. */
export interface PayablesBatchToPay { readonly id: string; readonly version: number; readonly supplierId: string; readonly currency: string; readonly reserved: string; readonly items: readonly { readonly documentId: string; readonly documentNumber: string; readonly amount: string }[] }
interface LineState { amount: string; vat: boolean; vatRate: "75" | "100"; vatBase: string; islr: boolean; islrConcept: string; islrBase: string; islrUnit: string }
const CONTROL = "rounded-lg border border-default-300 bg-background px-3 py-2";
const AMOUNT = /^\d+(\.\d{1,2})?$/;
const METHODS = [["cash", "Efectivo"], ["transfer", "Transferencia"], ["check", "Cheque"]] as const;

/** Side panel that pays documents (CXP-016–025) or executes an authorized batch.
 * Money and rates are valued by the server; the panel only states amounts and accounts.
 * @param props - Request scope, preselected supplier or batch, and close/done handlers.
 * @returns The payment drawer.
 */
export function PayablesPaymentForm({ scope, supplierId: initialSupplier, batch, onClose, onDone }: {
  readonly scope: PayablesRequestScope;
  readonly supplierId?: string;
  readonly batch?: PayablesBatchToPay;
  readonly onClose: () => void;
  readonly onDone: () => void;
}): React.JSX.Element {
  const [supplierId, setSupplierId] = useState(batch?.supplierId ?? initialSupplier ?? "");
  const [currency, setCurrency] = useState(batch?.currency ?? "VES");
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>("transfer");
  const [accountId, setAccountId] = useState("");
  const [checkbookId, setCheckbookId] = useState("");
  const [reference, setReference] = useState("");
  const [occurredAt, setOccurredAt] = useState(payablesToday());
  const [concept, setConcept] = useState("");
  const [lines, setLines] = useState<Readonly<Record<string, LineState>>>({});
  const suppliers = usePayablesReport<Supplier>({ kind: "suppliers", limit: 200 });
  const accounts = usePayablesReport<Account>({ kind: "treasury_accounts", limit: 200 });
  const documents = usePayablesReport<OpenDocument>(!batch && supplierId ? { kind: "list_pending", supplierId, limit: 200 } : null);
  const policy = usePayablesReport<{ readonly vatWithholdingAgent: boolean; readonly islrWithholdingAgent: boolean }>({ kind: "policy" });
  const agent = policy.data?.rows[0];
  const supplier = suppliers.data?.rows.find((row) => row.id === supplierId);
  const usable = (accounts.data?.rows ?? []).filter((account) => account.currency === currency && (method === "cash" ? account.kind === "cash_box" : account.kind === "bank_account"));
  const account = usable.find((row) => row.id === accountId);
  const payable = (documents.data?.rows ?? []).filter((row) => row.side === "debit");
  const concepts = useMemo(() => listIslrConceptsForPurchases().filter((item) => !item.progressiveTariff), []);
  const lineFor = (documentId: string): LineState => lines[documentId] ?? { amount: "", vat: false, vatRate: supplier?.vatWithholdingRate === "100" ? "100" : "75", vatBase: "", islr: false, islrConcept: "", islrBase: "", islrUnit: "" };
  const update = (documentId: string, patch: Partial<LineState>) => setLines((current) => ({ ...current, [documentId]: { ...lineFor(documentId), ...patch } }));
  const selected = batch ? batch.items.map((item) => [item.documentId, item.amount] as const) : Object.entries(lines).filter(([, line]) => line.amount.trim() !== "").map(([documentId, line]) => [documentId, line.amount.trim()] as const);
  const validAmounts = selected.length > 0 && selected.every(([, amount]) => AMOUNT.test(amount) && compareDecimal(exactDecimal(amount), exactDecimal("0")) > 0);
  const total = validAmounts ? selected.reduce((sum, [, amount]) => addDecimal(sum, exactDecimal(amount)), exactDecimal("0")) : null;
  const ready = validAmounts && !!account && (method !== "transfer" || reference.trim() !== "") && (method !== "check" || checkbookId !== "") && !!supplierId;
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!ready || !total || !account) return;
    setSaving(true);
    try {
      const withholdings = batch ? [] : Object.entries(lines).flatMap(([documentId, line]) => [
        ...(line.vat ? [{ id: newPayablesId(), documentId, kind: "vat", rate: line.vatRate, ...(line.vatBase.trim() ? { taxableBaseVes: line.vatBase.trim() } : {}) }] : []),
        ...(line.islr ? [{ id: newPayablesId(), documentId, kind: "islr", conceptCode: line.islrConcept, taxableBaseVes: line.islrBase.trim(), taxUnitValue: line.islrUnit.trim() }] : []),
      ]);
      const debtCurrencies = [...new Set(batch ? [batch.currency] : payable.filter((row) => lines[row.documentId]?.amount.trim()).map((row) => row.currency))];
      // The money valuation sent here is a placeholder; the server replaces it with the BCV snapshot of the date.
      const money = { amount: total, currency, operationalValue: { baseCurrency: "VES", amount: "0", rate: "1", source: "client", asOf: occurredAt, policyVersion: "client", rounding: "half_up" } };
      const facts = { method, account: { kind: account.kind, id: account.id }, occurredAt, money, debtCurrencies, withholdings, ...(method === "check" ? { checkbookId } : {}), ...(method === "transfer" ? { reference: reference.trim() } : {}), ...(concept.trim() ? { concept: concept.trim() } : {}) };
      const result = batch
        ? await executePayablesCommand(scope, { kind: "execute_payment_batch", batchId: batch.id, expectedVersion: batch.version, paymentId: newPayablesId(), ...facts })
        : await executePayablesCommand(scope, { kind: "execute_supplier_payment", paymentId: newPayablesId(), supplierId, lines: selected.map(([documentId, amount]) => ({ lineId: newPayablesId(), documentId, amount })), ...facts });
      const warnings = (result as { readonly warnings?: readonly { readonly code: string }[] }).warnings ?? [];
      const checkNumber = (result as { readonly checkNumber?: string | null }).checkNumber;
      notify.success(checkNumber ? `Pago registrado con el cheque N° ${checkNumber}.` : "Pago registrado.");
      if (warnings.some((warning) => warning.code === "LATE_WITHHOLDING")) notify.error("Retención extemporánea: el documento ya estaba registrado sin retención. Quedó auditada.");
      onDone();
    } catch (cause: unknown) {
      notify.failure(cause, "No se pudo registrar el pago.");
    } finally { setSaving(false); }
  }

  return <ResponsiveDrawer isOpen onClose={onClose} title={batch ? "Ejecutar lote de pago" : "Nuevo pago a proveedor"} subtitle="La tasa BCV del pago y de cada deuda se toma en el servidor." desktopSize="3xl"
    footer={<div className="flex items-center justify-between gap-2 p-4"><span className="text-sm">Total: <strong className="tabular-nums">{total ? formatPayablesAmount(total) : "—"} {currency}</strong></span><div className="flex gap-2"><button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" onClick={onClose}>Cancelar</button><button form="payables-payment" type="submit" disabled={!ready || saving} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Registrando…" : "Registrar pago"}</button></div></div>}>
    <form id="payables-payment" onSubmit={(event) => void submit(event)} className="grid gap-4 p-5 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 sm:col-span-2">Proveedor<select required disabled={!!batch} value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setLines({}); }} className={CONTROL}><option value="">Selecciona</option>{(suppliers.data?.rows ?? []).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.rif}</option>)}</select></label>
        <label className="grid gap-1">Moneda del pago<select disabled={!!batch} value={currency} onChange={(event) => { setCurrency(event.target.value); setAccountId(""); }} className={CONTROL}><option>VES</option><option>USD</option><option>EUR</option></select></label>
        <label className="grid gap-1">Forma de pago<select value={method} onChange={(event) => { setMethod(event.target.value as (typeof METHODS)[number][0]); setAccountId(""); setCheckbookId(""); }} className={CONTROL}>{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="grid gap-1">{method === "cash" ? "Caja" : "Cuenta bancaria"}<select required value={accountId} onChange={(event) => { setAccountId(event.target.value); setCheckbookId(""); }} className={CONTROL}><option value="">Selecciona</option>{usable.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.currency}</option>)}</select></label>
        <label className="grid gap-1">Fecha<input required type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} className={CONTROL} /></label>
        {method === "check" && <label className="grid gap-1">Chequera<select required value={checkbookId} onChange={(event) => setCheckbookId(event.target.value)} className={CONTROL}><option value="">Selecciona</option>{(account?.checkbooks ?? []).map((book) => <option key={book.id} value={book.id}>Próximo N° {book.nextNumber} (hasta {book.lastNumber})</option>)}</select></label>}
        {method === "transfer" && <label className="grid gap-1">Referencia<input required value={reference} onChange={(event) => setReference(event.target.value)} className={CONTROL} /></label>}
        <label className="grid gap-1 sm:col-span-2">Concepto (opcional)<input value={concept} onChange={(event) => setConcept(event.target.value)} className={CONTROL} /></label>
      </div>
      {usable.length === 0 && accounts.data && <p className="text-danger">No hay {method === "cash" ? "cajas" : "cuentas bancarias"} activas en {currency}. Créalas en Tesorería.</p>}
      {batch ? <table className="w-full text-left"><thead><tr><th className="py-1">Documento</th><th className="py-1 text-right">Importe reservado</th></tr></thead><tbody>{batch.items.map((item) => <tr key={item.documentId}><td className="py-1">{item.documentNumber || item.documentId}</td><td className="py-1 text-right tabular-nums">{formatPayablesAmount(item.amount)} {batch.currency}</td></tr>)}</tbody></table>
        : !supplierId ? <p className="text-[var(--text-secondary)]">Selecciona un proveedor para ver sus documentos abiertos.</p>
        : documents.loading ? <p role="status">Cargando documentos…</p>
        : payable.length === 0 ? <p className="text-[var(--text-secondary)]">El proveedor no tiene documentos pendientes.</p>
        : <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="py-1">Documento</th><th className="py-1">Vence</th><th className="py-1 text-right">Saldo</th><th className="py-1">Pagar ({currency})</th>{(agent?.vatWithholdingAgent || agent?.islrWithholdingAgent) && <th className="py-1">Retenciones al pago</th>}</tr></thead>
          <tbody>{payable.map((row) => { const line = lineFor(row.documentId); return <tr key={row.documentId} className="align-top">
            <td className="py-2 pr-2">{PAYABLE_KIND_LABELS[row.kind] ?? row.kind} {row.documentNumber}</td>
            <td className="py-2 pr-2">{row.dueAt}</td>
            <td className="py-2 pr-2 text-right tabular-nums">{formatPayablesAmount(row.balance)} {row.currency}</td>
            <td className="py-2 pr-2"><div className="flex gap-1"><input inputMode="decimal" placeholder="0.00" aria-label={`Importe para ${row.documentNumber}`} value={line.amount} onChange={(event) => update(row.documentId, { amount: event.target.value })} className={`${CONTROL} w-28`} />{row.currency === currency && <button type="button" className="text-xs underline" onClick={() => update(row.documentId, { amount: exactTwo(row.balance) })}>Todo</button>}</div>{row.currency !== currency && <span className="text-xs text-[var(--text-secondary)]">Se convierte a {row.currency} con las tasas del día.</span>}</td>
            {(agent?.vatWithholdingAgent || agent?.islrWithholdingAgent) && <td className="py-2"><div className="grid gap-1 text-xs">
              {agent?.vatWithholdingAgent && <label className="flex flex-wrap items-center gap-1"><input type="checkbox" checked={line.vat} onChange={(event) => update(row.documentId, { vat: event.target.checked })} />IVA<select value={line.vatRate} disabled={!line.vat} onChange={(event) => update(row.documentId, { vatRate: event.target.value as "75" | "100" })} className="rounded border px-1"><option value="75">75%</option><option value="100">100%</option></select><input placeholder="IVA del documento (Bs)" disabled={!line.vat} value={line.vatBase} onChange={(event) => update(row.documentId, { vatBase: event.target.value })} className="w-36 rounded border px-1" /></label>}
              {agent?.islrWithholdingAgent && <label className="flex flex-wrap items-center gap-1"><input type="checkbox" checked={line.islr} onChange={(event) => update(row.documentId, { islr: event.target.checked })} />ISLR<select disabled={!line.islr} value={line.islrConcept} onChange={(event) => update(row.documentId, { islrConcept: event.target.value })} className="max-w-48 rounded border px-1"><option value="">Concepto</option>{concepts.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.description}</option>)}</select><input placeholder="Base (Bs)" disabled={!line.islr} value={line.islrBase} onChange={(event) => update(row.documentId, { islrBase: event.target.value })} className="w-24 rounded border px-1" /><input placeholder="U.T. (Bs)" disabled={!line.islr} value={line.islrUnit} onChange={(event) => update(row.documentId, { islrUnit: event.target.value })} className="w-20 rounded border px-1" /></label>}
            </div></td>}
          </tr>; })}</tbody></table></div>}
      <p className="text-xs text-[var(--text-secondary)]">Sin anticipos: el pago debe cubrir solo saldos abiertos. El IVA retenido usa el IVA registrado en la compra si no indicas otro.</p>
    </form>
  </ResponsiveDrawer>;
}

function exactTwo(value: string): string {
  const [whole = "0", fraction = ""] = value.split(".");
  return `${whole}.${(fraction + "00").slice(0, 2)}`;
}
