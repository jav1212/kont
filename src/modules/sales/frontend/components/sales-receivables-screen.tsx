"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInvoiceExchangeRates } from "@/src/modules/inventory/frontend/hooks/use-invoice-exchange-rates";
import { CurrencyCombobox } from "@/src/modules/inventory/frontend/components/currency-combobox";
import { normalizeCurrencyCode, type CurrencyCode } from "@/src/modules/inventory/shared/currency";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { notify } from "@/src/shared/frontend/notify";

type Receivable = { id: string; sales_invoice_id: string; customer_id: string; debt_currency_code: string; original_amount: number; debt_exchange_rate: number; due_date: string; status: string };
type ReceivablePayment = { id: string; receivable_id: string; applied_debt_amount: number; occurred_at: string; received_amount: number; received_currency_code: string; exchange_rate_to_ves: number };
type ScreenData = { accounts: Receivable[]; payments: ReceivablePayment[]; invoices: Array<{ id: string; invoice_number: string; invoice_date: string }>; customers: Array<{ id: string; name: string; rif: string }> };

const amount = (value: number) => value.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Renders open credit sales and records partial payments with captured exchange rates. */
export function SalesReceivablesScreen() {
    const { companyId } = useCompany();
    const today = getTodayIsoDate();
    const { options, appliedRates, getRate, publishedDate } = useInvoiceExchangeRates(today);
    const [data, setData] = useState<ScreenData>({ accounts: [], payments: [], invoices: [], customers: [] });
    const [selected, setSelected] = useState("");
    const [currency, setCurrency] = useState<CurrencyCode>("VES");
    const [receivedAmount, setReceivedAmount] = useState("");
    const [reference, setReference] = useState("");
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!companyId) return;
        const response = await apiFetch(`/api/sales/receivables?companyId=${encodeURIComponent(companyId)}`);
        const json = await response.json();
        if (!response.ok) { notify.error(json.error ?? "No se pudieron cargar las cuentas por cobrar"); return; }
        setData(json.data as ScreenData);
    }, [companyId]);

    useEffect(() => { void refresh(); }, [refresh]);

    const accountRows = useMemo(() => data.accounts.map((account) => {
        const paid = data.payments.filter((payment) => payment.receivable_id === account.id).reduce((sum, payment) => sum + Number(payment.applied_debt_amount), 0);
        return { account, paid, balance: Math.max(0, Number(account.original_amount) - paid), customer: data.customers.find((customer) => customer.id === account.customer_id), invoice: data.invoices.find((invoice) => invoice.id === account.sales_invoice_id) };
    }), [data]);
    const selectedAccount = accountRows.find((row) => row.account.id === selected);
    const activeAccount = selectedAccount?.account.status === "open" && selectedAccount.balance > 0 ? selectedAccount : undefined;
    const paymentRate = getRate(currency);

    async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const value = Number(receivedAmount);
        if (!activeAccount || !Number.isFinite(value) || value <= 0 || !paymentRate || !companyId) return;
        setLoading(true);
        try {
            const source = currency === "VES" ? "identity" : appliedRates.find((rate) => normalizeCurrencyCode(rate.currencyCode) === currency)?.source ?? "bcv";
            const response = await apiFetch("/api/sales/receivables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                receivableId: activeAccount.account.id, idempotencyKey: crypto.randomUUID(), receivedAmount,
                receivedCurrencyCode: currency, exchangeRateToVes: String(paymentRate), rateEffectiveDate: publishedDate ?? today,
                rateSource: source, reference: reference.trim() || null,
            }) });
            const json = await response.json();
            if (!response.ok) { notify.error(json.error ?? "No se pudo registrar el abono"); return; }
            notify.success("Abono registrado");
            setReceivedAmount(""); setReference("");
            await refresh();
        } catch (error) { notify.error(error instanceof Error ? error.message : "Error de red al registrar el abono"); }
        finally { setLoading(false); }
    }

    return <div className="mx-auto grid w-full max-w-6xl gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 rounded-2xl border border-border-light bg-surface-1 p-5">
            <h2 className="text-lg font-semibold">Cuentas por cobrar</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Saldos en la moneda pactada, con cada abono y tasa registrados.</p>
            <div className="mt-4 divide-y divide-border-light">
                {accountRows.length === 0 && <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Todavía no hay ventas a crédito.</p>}
                {accountRows.map(({ account, balance, customer, invoice }) => <button key={account.id} type="button" onClick={() => setSelected(account.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg px-3 py-4 text-left ${selected === account.id ? "bg-primary-500/10" : "hover:bg-surface-2"}`}>
                    <span className="min-w-0"><span className="block truncate font-semibold">{customer?.name ?? "Cliente"}</span><span className="mt-1 block text-xs text-[var(--text-secondary)]">Factura {invoice?.invoice_number ?? "—"} · Vence {account.due_date}</span></span>
                    <span className="text-right"><span className="block font-mono font-bold">{amount(balance)} {normalizeCurrencyCode(account.debt_currency_code)}</span><span className={`mt-1 block text-[10px] uppercase ${account.status === "settled" ? "text-emerald-600" : account.due_date < today && balance > 0 ? "text-red-600" : "text-[var(--text-tertiary)]"}`}>{account.status === "settled" || balance <= 0 ? "Pagada" : account.due_date < today ? "Vencida" : "Pendiente"}</span></span>
                </button>)}
            </div>
        </section>
        <section className="rounded-2xl border border-border-light bg-surface-1 p-5">
            <h2 className="text-base font-semibold">Registrar abono</h2>
            {!activeAccount ? <p className="mt-3 text-sm text-[var(--text-secondary)]">{selectedAccount ? "Esta cuenta está saldada; puedes revisar sus abonos." : "Selecciona una cuenta pendiente."}</p> : <>
                <p className="mt-2 rounded-lg bg-surface-2 p-3 font-mono text-sm">Saldo: {amount(activeAccount.balance)} {normalizeCurrencyCode(activeAccount.account.debt_currency_code)}</p>
                <form className="mt-4 space-y-3" onSubmit={submitPayment}>
                    <CurrencyCombobox label="Moneda recibida" value={currency} options={options} onChange={setCurrency}/>
                    <label className="block text-xs font-medium">Monto recibido<input required type="number" min="0.00000001" step="any" value={receivedAmount} onChange={(event) => setReceivedAmount(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border-light bg-surface-1 px-3 font-mono text-sm"/></label>
                    <p className="text-xs text-[var(--text-secondary)]">Tasa: {amount(paymentRate ?? 0)} Bs/{currency}. Se aplicará {amount(Number(receivedAmount || 0) * (paymentRate ?? 0) / Number(activeAccount.account.debt_exchange_rate))} {normalizeCurrencyCode(activeAccount.account.debt_currency_code)} al saldo.</p>
                    <label className="block text-xs font-medium">Referencia (opcional)<input value={reference} onChange={(event) => setReference(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border-light bg-surface-1 px-3 text-sm"/></label>
                    <button type="submit" disabled={loading || !paymentRate || !receivedAmount} className="h-11 w-full rounded-lg bg-primary-500 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Guardando…" : "Registrar abono"}</button>
                </form>
            </>}
            {selectedAccount && <div className="mt-5 border-t border-border-light pt-4">
                <h3 className="text-sm font-semibold">Historial de abonos</h3>
                {data.payments.filter((payment) => payment.receivable_id === selectedAccount.account.id).length === 0
                    ? <p className="mt-2 text-xs text-[var(--text-secondary)]">Sin abonos registrados.</p>
                    : <div className="mt-2 space-y-2">{data.payments.filter((payment) => payment.receivable_id === selectedAccount.account.id).map((payment) => <div key={payment.id} className="rounded-lg bg-surface-2 px-3 py-2 text-xs"><div className="flex justify-between gap-2"><span>{new Date(payment.occurred_at).toLocaleDateString("es-VE")}</span><strong className="font-mono">{amount(Number(payment.received_amount))} {normalizeCurrencyCode(payment.received_currency_code)}</strong></div><p className="mt-1 text-[var(--text-secondary)]">Aplicado: {amount(Number(payment.applied_debt_amount))} {normalizeCurrencyCode(selectedAccount.account.debt_currency_code)} · tasa: {amount(Number(payment.exchange_rate_to_ves))} Bs/{normalizeCurrencyCode(payment.received_currency_code)}</p></div>)}</div>}
            </div>}
        </section>
    </div>;
}
