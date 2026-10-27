"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TreasuryCheckRow, TreasuryPaymentExecutionRow, TreasuryReportRow } from "../treasury-rows";
import { exactDecimal } from "@kontave/monetary/domain";
import { useTreasuryContext } from "../context/treasury-context";
import { useTreasuryCatalogs } from "../hooks/use-treasury-catalogs";
import { useTreasuryCommand } from "../hooks/use-treasury-command";
import { TreasuryInput, TreasurySelect, notifyTreasuryFailure, treasuryAccountLabel, treasuryToday } from "./treasury-form-controls";
import { notify } from "@/src/shared/frontend/notify";
import { ApiRequestFailure } from "@/src/shared/frontend/feedback/api-request-failure";

type PaymentOrder = { readonly id: string; readonly beneficiary: string; readonly concept: string; readonly amount: string; readonly currency: string; readonly dueDate: string | null; readonly status: "draft" | "cancelled"; readonly version: number };
type PaymentMethod = "cash" | "bank_debit" | "check";
const METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = { cash: "Efectivo", bank_debit: "Débito bancario", check: "Cheque ya emitido" };
const ORDER_LIMIT = 100;
const HISTORY_PAGE_SIZE = 50;

/** Lists payable orders, settles one through cash, bank debit or an issued check, and shows the settlement history.
 *
 * Cash settles only from a cash box; bank debit and check only from a bank account. A check must belong to
 * the paying account, be issued or delivered, and match the order amount and currency exactly; the server
 * re-validates all of this together with the account version.
 *
 * @param props - Settlement-history period from the page URL and whether the actor holds `treasury.post`.
 * @returns The payment-orders workspace.
 */
export function PaymentOrderExecution({ from, to, canPay }: { readonly from: string; readonly to: string; readonly canPay: boolean }): React.JSX.Element {
  const { companyId, query, revision } = useTreasuryContext();
  const catalogs = useTreasuryCatalogs();
  const command = useTreasuryCommand();
  const [orders, setOrders] = useState<readonly PaymentOrder[]>([]);
  const [paidOrderIds, setPaidOrderIds] = useState<ReadonlySet<string>>(new Set());
  const [history, setHistory] = useState<readonly TreasuryReportRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [orderId, setOrderId] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [accountId, setAccountId] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [checkId, setCheckId] = useState("");
  const [paymentDate, setPaymentDate] = useState(treasuryToday);
  const [checks, setChecks] = useState<readonly TreasuryCheckRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/security/payment-orders?companyId=${encodeURIComponent(companyId)}&offset=0&limit=${ORDER_LIMIT}`, { cache: "no-store" });
      if (!response.ok) throw new ApiRequestFailure(response, "No se pudieron consultar las órdenes de pago.");
      const payload = await response.json() as { data?: { entries?: readonly PaymentOrder[] } };
      const drafts = (payload.data?.entries ?? []).filter((order) => order.status === "draft");
      const settled = await Promise.all(drafts.map(async (order) => {
        const execution = await query<TreasuryPaymentExecutionRow>({ kind: "get_payment_order_execution", paymentOrderId: order.id, page: 1, pageSize: 1 });
        return execution.items.length ? order.id : null;
      }));
      setOrders(drafts); setPaidOrderIds(new Set(settled.filter((id): id is string => id !== null)));
    } catch (cause: unknown) { notifyTreasuryFailure(cause, "No se pudieron consultar las órdenes de pago.", "treasury:payments:orders"); }
    finally { setLoading(false); }
  }, [companyId, query]);
  useEffect(() => { void loadOrders(); }, [loadOrders, revision]);

  useEffect(() => { setHistoryPage(1); }, [from, to]);
  useEffect(() => {
    let active = true;
    void query<TreasuryReportRow>({ kind: "treasury_report", report: "payments", from, to, page: historyPage, pageSize: HISTORY_PAGE_SIZE })
      .then((result) => { if (active) { setHistory(result.items); setHistoryTotal(result.total); } })
      .catch((cause: unknown) => { if (active) notifyTreasuryFailure(cause, "No se pudo consultar el historial de pagos.", "treasury:payments:history"); });
    return () => { active = false; };
  }, [from, historyPage, query, revision, to]);

  const order = orders.find((item) => item.id === orderId && !paidOrderIds.has(item.id));
  const account = catalogs.accounts.find((item) => item.id === accountId);
  const beneficiary = catalogs.beneficiaries.find((item) => item.id === beneficiaryId && item.status === "active");
  const accountOptions = catalogs.accounts.filter((item) => item.status === "active"
    && (method === "cash") === (item.rowKind === "cash_box")
    && (!order || item.currency === order.currency));

  useEffect(() => {
    if (method !== "check" || !account || account.rowKind !== "bank_account") { setChecks([]); return; }
    let active = true;
    // Issued and delivered checks are both payable instruments; voided or cleared ones are not.
    void Promise.all((["issued", "delivered"] as const).map((status) => query<TreasuryCheckRow>({ kind: "list_checks", bankAccountId: account.id, status, page: 1, pageSize: 500 })))
      .then((pages) => { if (active) setChecks(pages.flatMap((page) => page.items)); })
      .catch((cause: unknown) => { if (active) notifyTreasuryFailure(cause, "No se pudieron consultar los cheques de la cuenta.", "treasury:payments:checks"); });
    return () => { active = false; };
  }, [account, method, query, revision]);

  const checkOptions = useMemo(() => order
    ? checks.filter((item) => item.currency === order.currency && exactDecimal(item.amount) === exactDecimal(order.amount))
    : [], [checks, order]);
  const check = checkOptions.find((item) => item.id === checkId);

  const changeMethod = (next: PaymentMethod) => { setMethod(next); setAccountId(""); setCheckId(""); };
  const changeOrder = (next: string) => { setOrderId(next); setAccountId(""); setCheckId(""); };

  const pay = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order || !account || !beneficiary) { notify.error("Selecciona la orden, la cuenta y el beneficiario.", { deduplicationKey: "treasury:payments:validation" }); return; }
    if (account.status !== "active") { notify.error("La cuenta de pago debe estar activa.", { deduplicationKey: "treasury:payments:validation" }); return; }
    if (account.currency !== order.currency) { notify.error("La moneda de la cuenta debe coincidir con la orden.", { deduplicationKey: "treasury:payments:validation" }); return; }
    if ((method === "cash") !== (account.rowKind === "cash_box")) { notify.error("El efectivo se paga desde una caja; el débito y el cheque, desde una cuenta bancaria.", { deduplicationKey: "treasury:payments:validation" }); return; }
    if (method === "check" && !check) { notify.error("Selecciona un cheque de la cuenta por el mismo monto y moneda de la orden.", { deduplicationKey: "treasury:payments:validation" }); return; }
    try {
      await command.execute((identity, paymentId) => ({
        ...identity,
        kind: "execute_payment_order",
        paymentId,
        paymentOrderId: order.id,
        beneficiaryId: beneficiary.id,
        account: { kind: account.rowKind, id: account.id, currency: account.currency },
        money: { amount: order.amount, currency: order.currency },
        operationalDate: paymentDate,
        valueDate: paymentDate,
        method,
        ...(method === "check" && check ? { instrumentId: check.id } : {}),
        expectedAccountVersion: account.version,
      }), `payment:${order.id}`);
      setOrderId(""); setCheckId("");
      notify.success(`Orden pagada con ${METHOD_LABELS[method].toLowerCase()}.`);
    } catch (cause: unknown) { notifyTreasuryFailure(cause, "No se pudo ejecutar el pago.", "treasury:payments:execute"); }
  };

  const payable = orders.filter((item) => !paidOrderIds.has(item.id));
  const historyColumns = ["valueDate", "paymentOrderId", "method", "amount", "currency", "accountId"] as const;
  const historyLabels: Readonly<Record<(typeof historyColumns)[number], string>> = { valueDate: "Fecha", paymentOrderId: "Orden", method: "Forma de pago", amount: "Monto", currency: "Moneda", accountId: "Cuenta" };

  return <div className="space-y-6">
    <section className="rounded-xl border border-default-200 bg-content1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Ejecutar orden de pago</h2><p className="mt-1 text-sm text-default-500">{loading ? "Cargando órdenes…" : `${payable.length} órdenes pendientes de pago.`} La administración de borradores vive en <Link href="/settings/payment-orders" className="text-primary underline">Configuración</Link>.</p></div></div>
      {canPay ? <form onSubmit={pay} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TreasurySelect label="Orden pendiente" value={orderId} onChange={changeOrder} optional emptyLabel="Selecciona" options={payable.map((item) => [item.id, `${item.beneficiary} · ${item.amount} ${item.currency} · ${item.concept}`])} />
        <TreasurySelect label="Forma de pago" value={method} onChange={(value) => changeMethod(value as PaymentMethod)} options={Object.entries(METHOD_LABELS)} />
        <TreasurySelect label={method === "cash" ? "Caja" : "Cuenta bancaria"} value={accountId} onChange={(value) => { setAccountId(value); setCheckId(""); }} optional emptyLabel="Selecciona" options={accountOptions.map((item) => [item.id, treasuryAccountLabel(item)])} />
        {method === "check" && <div className="grid gap-1"><TreasurySelect label="Cheque" value={checkId} onChange={setCheckId} optional emptyLabel="Selecciona" options={checkOptions.map((item) => [item.id, `N.º ${item.number} · ${item.amount} ${item.currency} · ${item.issueDate} · ${item.status === "delivered" ? "entregado" : "emitido"}`])} />{order && account && checkOptions.length === 0 && <p className="text-xs text-warning-700">No hay cheques de esta cuenta por {order.amount} {order.currency}. <Link href={`/treasury/checks?account=${encodeURIComponent(account.id)}`} className="underline">Emitir cheque</Link></p>}</div>}
        <TreasurySelect label="Beneficiario de Tesorería" value={beneficiaryId} onChange={setBeneficiaryId} optional emptyLabel="Selecciona" options={catalogs.beneficiaries.filter((item) => item.status === "active").map((item) => [item.id, item.legalName])} />
        <TreasuryInput label="Fecha de pago" type="date" value={paymentDate} onChange={setPaymentDate} />
        <div className="flex items-end"><button type="submit" disabled={command.pending || !order || !account || !beneficiary || (method === "check" && !check)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{command.pending ? "Procesando…" : "Ejecutar pago"}</button></div>
      </form> : <p className="mt-4 text-sm text-warning-700">Necesitas el permiso de publicación de Tesorería para ejecutar pagos.</p>}
    </section>
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1">
      <div className="flex justify-between border-b border-default-200 p-4"><h2 className="font-semibold">Historial de liquidaciones</h2><span className="text-sm">{historyTotal} pagos</span></div>
      {history.length === 0 ? <p className="p-6 text-sm text-default-500">No hay pagos registrados en el período.</p> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-default-100 text-left"><tr>{historyColumns.map((column) => <th key={column} className="px-4 py-3">{historyLabels[column]}</th>)}</tr></thead><tbody>{history.map((row, index) => <tr key={String(row.values.paymentId ?? index)} className="border-t border-default-100">{historyColumns.map((column) => <td key={column} className="px-4 py-3">{column === "method" ? METHOD_LABELS[row.values.method as PaymentMethod] ?? String(row.values.method ?? "—") : String(row.values[column] ?? "—")}</td>)}</tr>)}</tbody></table></div>}
      <div className="flex justify-between border-t border-default-200 p-4 text-sm"><button type="button" disabled={historyPage === 1} onClick={() => setHistoryPage((page) => page - 1)} className="disabled:opacity-50">Anterior</button><span>Página {historyPage}</span><button type="button" disabled={historyPage * HISTORY_PAGE_SIZE >= historyTotal} onClick={() => setHistoryPage((page) => page + 1)} className="disabled:opacity-50">Siguiente</button></div>
    </section>
  </div>;
}
