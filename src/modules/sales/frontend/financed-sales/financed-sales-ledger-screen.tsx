"use client";

// Screen: persisted ledger of sales financed by a third party (Cashea).
// Daily sales and financier deposits are typed, pasted or imported; deposits
// are applied first-in first-out at the BCV rate of their date and every change
// re-synchronizes the draft journal in Accounting.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeftRight, BookCheck, Check, ClipboardPaste, FileSpreadsheet, Landmark, Pencil, RefreshCw, Trash2, TrendingUp, Unlink, Upload, Wallet, X } from "lucide-react";
import { FINANCED_SALE_ACCOUNT_ROLES as ROLES, type FinancedSaleAccountRole } from "@kontave/sales/domain";
import type { FinancedSalesJournalSyncResult } from "@kontave/sales/application";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { StatTile } from "@/src/shared/frontend/components/stat-tile";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { usePostingAccounts } from "@/src/modules/accounting/frontend/hooks/use-posting-accounts";
import { fetchJson } from "@/src/shared/frontend/utils/api-fetch";
import { notify } from "@/src/shared/frontend/notify";
import { DEFAULT_ROLE_LABELS, ROLE_HINTS, formatVes as fmt, monthLabel } from "@/src/modules/sales/shared/financed-sales-labels";
import { downloadFinancedSalesTemplate, formatDate, parseAmountInput, parsePastedRows, readFinancedSalesWorkbook } from "./financed-sales-workbook";
import { Cell, FieldLabel, INPUT_CLS, Panel, Table } from "./financed-sales-ui";
import { FinancedSalesTreasuryReconciliation } from "./financed-sales-treasury-reconciliation";

type Totals = {
    saleAmountVes: string; upfrontVes: string; financedVes: string; collectedVes: string; commissionVes: string;
    realizedGainVes: string; realizedLossVes: string; outstandingCarriedVes: string;
};
type LedgerView = {
    settings: {
        financierName: string; upfrontPercent: string; commissionPercent: string; journalGranularity: "daily" | "monthly"; revalueMonthEnd: boolean;
        accounts: Partial<Record<FinancedSaleAccountRole, string>>; version: number;
    };
    sales: Array<{
        id: string; saleDate: string; amountVes: string; upfrontPercent: string; vesPerUsd: string; rateSource: "bcv" | "manual"; note: string | null;
        upfrontVes: string | null; financedVes: string | null; financedUsd: string | null; collectedVes: string | null;
        exchangeDifference: string | null; outstandingUsd: string | null; outstandingCarriedVes: string | null; lastCollectedOn: string | null;
    }>;
    deposits: Array<{ id: string; depositDate: string; amountVes: string; vesPerUsd: string; rateSource: "bcv" | "manual"; commissionPercent: string; reference: string | null; bankEntryId: string | null }>;
    revaluations: Array<{ month: string; date: string; vesPerUsd: string; outstandingUsd: string; carriedVes: string; revaluedVes: string; difference: string }>;
    revaluationError: string | null;
    unapplied: Array<{ depositId: string; unappliedUsd: string; unappliedVes: string }>;
    months: Array<Totals & { month: string }>;
    totals: Totals;
};
type Command =
    | { action: "add_sales"; sales: Array<{ saleDate: string; amountVes: string; vesPerUsd?: string }> }
    | { action: "add_deposits"; deposits: Array<{ depositDate: string; amountVes: string; reference?: string; commissionPercent?: string; vesPerUsd?: string; bankEntryId?: string }> }
    | { action: "link_bank_entries"; links: Array<{ depositId: string; bankEntryId: string | null }> }
    | { action: "update_sale"; id: string; sale: { saleDate: string; amountVes: string; vesPerUsd?: string } }
    | { action: "update_deposit"; id: string; deposit: { depositDate: string; amountVes: string; vesPerUsd?: string; reference: string } }
    | { action: "remove"; kind: "sale" | "deposit"; id: string }
    | { action: "save_settings"; settings: Omit<LedgerView["settings"], "version">; expectedVersion: number }
    | { action: "resync" };

const BASE_ROLES: readonly FinancedSaleAccountRole[] = ["bank", "financier_receivable", "sales", "exchange_gain", "exchange_loss"];
const UNREALIZED_ROLES: readonly FinancedSaleAccountRole[] = ["unrealized_exchange_gain", "unrealized_exchange_loss"];
const ROLE_NOTES: Partial<Record<FinancedSaleAccountRole, string>> = {
    financier_commission: " (si hay comisión)",
    unrealized_exchange_gain: " (cierre de mes)",
    unrealized_exchange_loss: " (cierre de mes)",
};
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
const nextDay = (date: string) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
};

/** Loads the ledger of the selected company and applies commands to it. */
function useFinancedSalesLedger(companyId: string | null) {
    const [view, setView] = useState<LedgerView | null>(null);
    const [journalSync, setJournalSync] = useState<FinancedSalesJournalSyncResult | null>(null);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) return;
        const { ok, json } = await fetchJson(`/api/sales/financed-sales?companyId=${encodeURIComponent(companyId)}`);
        if (!ok) { notify.error(json.error ?? "No se pudo cargar el libro de ventas financiadas."); return; }
        setView((json.data as { view: LedgerView }).view);
    }, [companyId]);

    useEffect(() => {
        let cancelled = false;
        if (companyId) {
            void fetchJson(`/api/sales/financed-sales?companyId=${encodeURIComponent(companyId)}`).then(({ ok, json }) => {
                if (cancelled) return;
                if (!ok) { notify.error(json.error ?? "No se pudo cargar el libro de ventas financiadas."); return; }
                setView((json.data as { view: LedgerView }).view);
            });
        }
        return () => { cancelled = true; };
    }, [companyId]);

    const run = useCallback(async (command: Command): Promise<boolean> => {
        if (!companyId) return false;
        setBusy(true);
        try {
            const { ok, json } = await fetchJson("/api/sales/financed-sales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId, ...command }),
            });
            if (!ok) {
                notify.error(json.error ?? "No se pudo guardar el cambio.");
                if ((json as { code?: string }).code === "SALES_CONCURRENCY_CONFLICT") await reload();
                return false;
            }
            const data = json.data as { view: LedgerView; journalSync: FinancedSalesJournalSyncResult | null };
            setView(data.view);
            if (!data.journalSync) return true;
            setJournalSync(data.journalSync);
            if (data.journalSync.status === "failed" || data.journalSync.status === "blocked_conflict") notify.warning(`Contabilidad: ${data.journalSync.message ?? "no se pudo sincronizar."}`);
            return true;
        } catch (caught) {
            notify.failure(caught, "No se pudo guardar el cambio.");
            return false;
        } finally {
            setBusy(false);
        }
    }, [companyId, reload]);

    return { view, journalSync, busy, run };
}

export function FinancedSalesLedgerScreen() {
    const { companyId } = useCompany();
    const { organization } = useOrganization();
    const { data: postingAccounts } = usePostingAccounts(organization?.id ?? null, companyId);
    const { view, journalSync, busy, run } = useFinancedSalesLedger(companyId);
    const excelInput = useRef<HTMLInputElement>(null);

    const [saleDate, setSaleDate] = useState(today);
    const [saleAmount, setSaleAmount] = useState("");
    const [depositDate, setDepositDate] = useState(today);
    const [depositAmount, setDepositAmount] = useState("");
    const [depositReference, setDepositReference] = useState("");
    const [pasteTarget, setPasteTarget] = useState<"sales" | "deposits" | null>(null);
    const [pasteText, setPasteText] = useState("");
    const [showSettings, setShowSettings] = useState(false);
    const [editing, setEditing] = useState<{ kind: "sale" | "deposit"; id: string } | null>(null);

    async function saveEdit(values: EditValues) {
        if (!editing) return;
        const amount = parseAmountInput(values.amount);
        if (!amount) { notify.error("Ingresa un monto válido."); return; }
        const rate = values.rate.trim() ? parseAmountInput(values.rate) : null;
        if (values.rate.trim() && !rate) { notify.error("Ingresa una tasa válida o déjala vacía para usar la BCV."); return; }
        const saved = editing.kind === "sale"
            ? await run({ action: "update_sale", id: editing.id, sale: { saleDate: values.date, amountVes: amount, ...(rate ? { vesPerUsd: rate } : {}) } })
            : await run({ action: "update_deposit", id: editing.id, deposit: { depositDate: values.date, amountVes: amount, reference: values.reference, ...(rate ? { vesPerUsd: rate } : {}) } });
        if (saved) { setEditing(null); notify.success("Registro actualizado."); }
    }

    const accountLabel = useCallback((role: FinancedSaleAccountRole) => {
        const account = postingAccounts.find((candidate) => candidate.id === view?.settings.accounts[role]);
        return account ? `${account.code} · ${account.name}` : DEFAULT_ROLE_LABELS[role];
    }, [postingAccounts, view]);

    const salesByNewest = useMemo(() => [...(view?.sales ?? [])].reverse(), [view]);
    const depositsByNewest = useMemo(() => [...(view?.deposits ?? [])].reverse(), [view]);
    const outstandingUsd = useMemo(() => (view?.sales ?? []).reduce((sum, sale) => sum + Number(sale.outstandingUsd ?? 0), 0), [view]);

    async function submitSale(event: FormEvent) {
        event.preventDefault();
        const amount = parseAmountInput(saleAmount);
        if (!amount) { notify.error("Ingresa un monto de venta válido."); return; }
        if (await run({ action: "add_sales", sales: [{ saleDate, amountVes: amount }] })) {
            setSaleAmount("");
            setSaleDate(nextDay(saleDate));
        }
    }

    async function submitDeposit(event: FormEvent) {
        event.preventDefault();
        const amount = parseAmountInput(depositAmount);
        if (!amount) { notify.error("Ingresa un monto de depósito válido."); return; }
        if (await run({ action: "add_deposits", deposits: [{ depositDate, amountVes: amount, ...(depositReference.trim() ? { reference: depositReference.trim() } : {}) }] })) {
            setDepositAmount("");
            setDepositReference("");
        }
    }

    async function submitPaste() {
        if (!pasteTarget) return;
        const { rows, rejectedLines } = parsePastedRows(pasteText);
        if (rejectedLines.length) notify.warning(`Se ignoraron las líneas ${rejectedLines.slice(0, 10).join(", ")}${rejectedLines.length > 10 ? "…" : ""} (falta fecha o monto).`);
        if (!rows.length) return;
        const saved = pasteTarget === "sales"
            ? await run({ action: "add_sales", sales: rows.map((row) => ({ saleDate: row.date, amountVes: row.amount })) })
            : await run({ action: "add_deposits", deposits: rows.map((row) => ({ depositDate: row.date, amountVes: row.amount })) });
        if (saved) {
            notify.success(`${rows.length} ${pasteTarget === "sales" ? "ventas" : "depósitos"} agregados.`);
            setPasteText("");
            setPasteTarget(null);
        }
    }

    async function importExcel(file: File | undefined) {
        if (!file) return;
        try {
            const { items, warnings } = await readFinancedSalesWorkbook(file);
            warnings.forEach((warning) => notify.warning(warning));
            if (!items.length) return;
            const known = new Set((view?.sales ?? []).map((sale) => `${sale.saleDate}|${Number(sale.amountVes).toFixed(2)}`));
            const fresh = items.filter((item) => !known.has(`${item.saleDate}|${Number(item.amountVes).toFixed(2)}`));
            if (fresh.length < items.length) notify.info(`${items.length - fresh.length} ventas ya estaban en el libro y se omitieron.`);
            if (fresh.length && await run({ action: "add_sales", sales: fresh.map((item) => ({ saleDate: item.saleDate, amountVes: item.amountVes })) })) {
                notify.success(`${fresh.length} ventas importadas.`);
            }
        } catch (caught) {
            notify.failure(caught, "No se pudo leer el archivo de ventas.");
        }
    }

    async function saveSettings(patch: Partial<LedgerView["settings"]>) {
        if (!view) return;
        const { version, ...current } = view.settings;
        await run({ action: "save_settings", settings: { ...current, ...patch }, expectedVersion: version });
    }

    const net = view ? Number(view.totals.realizedGainVes) - Number(view.totals.realizedLossVes) : 0;
    const requiredRoles = view ? [...BASE_ROLES, ...(view.settings.revalueMonthEnd ? UNREALIZED_ROLES : []), ...(Number(view.totals.commissionVes) > 0 ? ["financier_commission" as const] : [])] : [];
    const missingAccounts = view ? requiredRoles.filter((role) => !view.settings.accounts[role]) : [];

    return (
        <div className="px-8 py-6 space-y-6">
            {!view ? (
                <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">Cargando libro…</div>
            ) : (
                <>
                    <div className="grid gap-4 md:grid-cols-4">
                        <StatTile label="Ventas" value={`Bs. ${fmt(view.totals.saleAmountVes)}`} sublabel={`${view.sales.length} registros`} icon={Landmark} />
                        <StatTile label={`Por cobrar a ${view.settings.financierName}`} value={`$ ${outstandingUsd.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sublabel={`Bs. ${fmt(view.totals.outstandingCarriedVes)} a tasa histórica`} icon={Wallet} tone="muted" />
                        <StatTile label="Depositado" value={`Bs. ${fmt(view.totals.collectedVes)}`} sublabel={Number(view.totals.commissionVes) > 0 ? `Comisión: Bs. ${fmt(view.totals.commissionVes)}` : `${view.deposits.length} depósitos`} icon={ArrowLeftRight} />
                        <StatTile label="Diferencial neto" value={`Bs. ${fmt(String(net))}`} sublabel={`Pérdidas: Bs. ${fmt(view.totals.realizedLossVes)}`} icon={TrendingUp} tone={net >= 0 ? "success" : "warning"} />
                    </div>

                    <SyncBar journalSync={journalSync} missingAccounts={missingAccounts} busy={busy} onResync={() => { void run({ action: "resync" }); }} onConfigure={() => setShowSettings(true)} />

                    <div className="grid gap-6 lg:grid-cols-2">
                        <Panel title="Registrar venta del día" aside={
                            <div className="flex gap-1">
                                <BaseButton.Root variant="ghost" size="sm" leftIcon={<ClipboardPaste size={14} strokeWidth={2} />} onPress={() => setPasteTarget("sales")}>Pegar</BaseButton.Root>
                                <input ref={excelInput} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { void importExcel(event.target.files?.[0]); event.target.value = ""; }} />
                                <BaseButton.Root variant="ghost" size="sm" leftIcon={<Upload size={14} strokeWidth={2} />} onPress={() => excelInput.current?.click()}>Excel</BaseButton.Root>
                                <BaseButton.Root variant="ghost" size="sm" leftIcon={<FileSpreadsheet size={14} strokeWidth={2} />} onPress={downloadFinancedSalesTemplate}>Plantilla</BaseButton.Root>
                            </div>
                        }>
                            <form onSubmit={(event) => { void submitSale(event); }} className="grid grid-cols-[150px_1fr_auto] items-end gap-2">
                                <div><FieldLabel>Fecha</FieldLabel><input type="date" required value={saleDate} onChange={(event) => setSaleDate(event.target.value)} className={INPUT_CLS} /></div>
                                <div><FieldLabel>Venta a crédito Bs</FieldLabel><input autoFocus inputMode="decimal" required placeholder="7.455,25" value={saleAmount} onChange={(event) => setSaleAmount(event.target.value)} className={`${INPUT_CLS} text-right`} /></div>
                                <BaseButton.Root type="submit" variant="primary" size="sm" loading={busy}>Agregar</BaseButton.Root>
                            </form>
                            <p className="mt-2 font-sans text-[12px] text-[var(--text-tertiary)]">Enter guarda y pasa al día siguiente. La tasa BCV del día se toma sola; {fmt(view.settings.upfrontPercent)}% se cobra de contado.</p>
                        </Panel>

                        <Panel title={`Registrar depósito de ${view.settings.financierName}`} aside={
                            <BaseButton.Root variant="ghost" size="sm" leftIcon={<ClipboardPaste size={14} strokeWidth={2} />} onPress={() => setPasteTarget("deposits")}>Pegar</BaseButton.Root>
                        }>
                            <form onSubmit={(event) => { void submitDeposit(event); }} className="grid grid-cols-[150px_1fr_1fr_auto] items-end gap-2">
                                <div><FieldLabel>Fecha</FieldLabel><input type="date" required value={depositDate} onChange={(event) => setDepositDate(event.target.value)} className={INPUT_CLS} /></div>
                                <div><FieldLabel>Monto en banco Bs</FieldLabel><input inputMode="decimal" required placeholder="3.992,47" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} className={`${INPUT_CLS} text-right`} /></div>
                                <div><FieldLabel>Referencia</FieldLabel><input value={depositReference} onChange={(event) => setDepositReference(event.target.value)} className={INPUT_CLS} /></div>
                                <BaseButton.Root type="submit" variant="primary" size="sm" loading={busy}>Agregar</BaseButton.Root>
                            </form>
                            <p className="mt-2 font-sans text-[12px] text-[var(--text-tertiary)]">Se convierte a USD con la tasa BCV de la fecha del depósito y se aplica a las ventas pendientes más antiguas.</p>
                            {view.unapplied.length > 0 && (
                                <p className="mt-2 font-sans text-[12px] text-text-warning">
                                    {view.unapplied.length} depósito(s) superan lo pendiente por cobrar (Bs. {fmt(String(view.unapplied.reduce((sum, item) => sum + Number(item.unappliedVes), 0)))} sin aplicar). Revisa si falta registrar ventas.
                                </p>
                            )}
                        </Panel>
                    </div>

                    {pasteTarget && (
                        <Panel title={pasteTarget === "sales" ? "Pegar ventas" : "Pegar depósitos"} aside="Una línea por registro: fecha y monto">
                            <textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} rows={8} placeholder={"01/10/2025\t7.455,25\n02/10/2025\t5.384,43"} className="w-full rounded-lg border border-border-light bg-surface-1 p-3 font-mono text-[13px] outline-none focus:border-primary-500/60" />
                            <div className="mt-3 flex justify-end gap-2">
                                <BaseButton.Root variant="ghost" size="sm" onPress={() => { setPasteTarget(null); setPasteText(""); }}>Cancelar</BaseButton.Root>
                                <BaseButton.Root variant="primary" size="sm" loading={busy} isDisabled={!pasteText.trim()} onPress={() => { void submitPaste(); }}>Agregar {parsePastedRows(pasteText).rows.length || ""}</BaseButton.Root>
                            </div>
                        </Panel>
                    )}

                    <Panel title="Resumen mensual" aside="El diferencial se reconoce en el mes del depósito">
                        <Table headers={["Mes", "Ventas", "Contado", "Financiado", "Depositado", "Comisión", "Ganancia", "Pérdida", "Saldo"]}>
                            {view.months.map((month) => (
                                <tr key={month.month} className="border-b border-border-light/50 hover:bg-surface-2">
                                    <Cell left>{monthLabel(month.month)}</Cell>
                                    <Cell>{fmt(month.saleAmountVes)}</Cell>
                                    <Cell>{fmt(month.upfrontVes)}</Cell>
                                    <Cell>{fmt(month.financedVes)}</Cell>
                                    <Cell>{fmt(month.collectedVes)}</Cell>
                                    <Cell>{fmt(month.commissionVes)}</Cell>
                                    <Cell tone="success">{fmt(month.realizedGainVes)}</Cell>
                                    <Cell tone="warning">{fmt(month.realizedLossVes)}</Cell>
                                    <Cell>{fmt(month.outstandingCarriedVes)}</Cell>
                                </tr>
                            ))}
                        </Table>
                    </Panel>

                    {view.settings.revalueMonthEnd && (
                        <Panel title="Diferencial no realizado al cierre de mes" aside="Se reversa el día 1 del mes siguiente">
                            {view.revaluationError ? (
                                <p className="font-sans text-[12px] text-text-warning">No se pudo calcular: {view.revaluationError}</p>
                            ) : view.revaluations.length === 0 ? (
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)]">No hay saldos pendientes al cierre de los meses ya terminados.</p>
                            ) : (
                                <Table headers={["Mes", "Tasa al cierre", "Pendiente USD", "Bs históricos", "Bs al cierre", "Diferencial"]}>
                                    {view.revaluations.map((item) => (
                                        <tr key={item.month} className="border-b border-border-light/50 hover:bg-surface-2">
                                            <Cell left>{monthLabel(item.month)}</Cell>
                                            <Cell>{fmt(item.vesPerUsd, 4)}</Cell>
                                            <Cell>{fmt(item.outstandingUsd)}</Cell>
                                            <Cell>{fmt(item.carriedVes)}</Cell>
                                            <Cell>{fmt(item.revaluedVes)}</Cell>
                                            <Cell tone={Number(item.difference) < 0 ? "warning" : "success"}>{fmt(item.difference)}</Cell>
                                        </tr>
                                    ))}
                                </Table>
                            )}
                        </Panel>
                    )}

                    <FinancedSalesTreasuryReconciliation
                        deposits={view.deposits}
                        financierName={view.settings.financierName}
                        busy={busy}
                        onLink={(links) => run({ action: "link_bank_entries", links })}
                        onAddDeposits={(deposits) => run({ action: "add_deposits", deposits })}
                    />

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                        <Panel title="Ventas" aside={`${view.sales.length} registros`}>
                            <Table headers={["Fecha", "Venta Bs", "Tasa", "Financiado Bs", "Financiado USD", "Cobrado Bs", "Diferencial", "Saldo USD", ""]}>
                                {salesByNewest.map((sale) => editing?.kind === "sale" && editing.id === sale.id ? (
                                    <EditRow key={sale.id} columns={9} busy={busy} onCancel={() => setEditing(null)} onSave={(values) => { void saveEdit(values); }}
                                        initial={{ date: sale.saleDate, amount: sale.amountVes, rate: sale.rateSource === "manual" ? sale.vesPerUsd : "", reference: "" }} />
                                ) : (
                                    <tr key={sale.id} className="border-b border-border-light/50 hover:bg-surface-2">
                                        <Cell left>{formatDate(sale.saleDate)}</Cell>
                                        <Cell>{fmt(sale.amountVes)}</Cell>
                                        <Cell>{fmt(sale.vesPerUsd, 4)}{sale.rateSource === "manual" ? " *" : ""}</Cell>
                                        <Cell>{sale.financedVes ? fmt(sale.financedVes) : "—"}</Cell>
                                        <Cell>{sale.financedUsd ? fmt(sale.financedUsd) : "—"}</Cell>
                                        <Cell>{sale.collectedVes && Number(sale.collectedVes) > 0 ? fmt(sale.collectedVes) : "—"}</Cell>
                                        <Cell tone={Number(sale.exchangeDifference) < 0 ? "warning" : Number(sale.exchangeDifference) > 0 ? "success" : undefined}>{Number(sale.collectedVes) > 0 && sale.exchangeDifference ? fmt(sale.exchangeDifference) : "—"}</Cell>
                                        <Cell>{sale.outstandingUsd && Number(sale.outstandingUsd) > 0 ? fmt(sale.outstandingUsd) : "Cobrada"}</Cell>
                                        <td className="px-2 whitespace-nowrap">
                                            <IconButton label={`Editar venta del ${formatDate(sale.saleDate)}`} disabled={busy || editing !== null} onPress={() => setEditing({ kind: "sale", id: sale.id })}><Pencil size={14} strokeWidth={2} /></IconButton>
                                            <RemoveButton disabled={busy} label={`venta del ${formatDate(sale.saleDate)}`} onRemove={() => { void run({ action: "remove", kind: "sale", id: sale.id }); }} />
                                        </td>
                                    </tr>
                                ))}
                            </Table>
                        </Panel>
                        <Panel title="Depósitos" aside={`${view.deposits.length} registros`}>
                            <Table headers={["Fecha", "Monto Bs", "Tasa BCV", "USD", "Ref.", "Banco", ""]}>
                                {depositsByNewest.map((deposit) => editing?.kind === "deposit" && editing.id === deposit.id ? (
                                    <EditRow key={deposit.id} columns={7} busy={busy} withReference onCancel={() => setEditing(null)} onSave={(values) => { void saveEdit(values); }}
                                        initial={{ date: deposit.depositDate, amount: deposit.amountVes, rate: deposit.rateSource === "manual" ? deposit.vesPerUsd : "", reference: deposit.reference ?? "" }} />
                                ) : (
                                    <tr key={deposit.id} className="border-b border-border-light/50 hover:bg-surface-2">
                                        <Cell left>{formatDate(deposit.depositDate)}</Cell>
                                        <Cell>{fmt(deposit.amountVes)}</Cell>
                                        <Cell>{fmt(deposit.vesPerUsd, 4)}{deposit.rateSource === "manual" ? " *" : ""}</Cell>
                                        <Cell>{fmt(String(Number(deposit.amountVes) / (1 - Number(deposit.commissionPercent) / 100) / Number(deposit.vesPerUsd)))}</Cell>
                                        <Cell left>{deposit.reference ?? ""}</Cell>
                                        <Cell left>
                                            {deposit.bankEntryId ? (
                                                <span className="inline-flex items-center gap-1">
                                                    <span className="text-text-success" title="Conciliado con Tesorería">✓</span>
                                                    <IconButton label={`Desvincular del banco el depósito del ${formatDate(deposit.depositDate)}`} disabled={busy}
                                                        onPress={() => { void run({ action: "link_bank_entries", links: [{ depositId: deposit.id, bankEntryId: null }] }).then((ok) => { if (ok) notify.success("Depósito desvinculado del movimiento bancario."); }); }}>
                                                        <Unlink size={13} strokeWidth={2} />
                                                    </IconButton>
                                                </span>
                                            ) : <span className="text-[var(--text-tertiary)]">—</span>}
                                        </Cell>
                                        <td className="px-2 whitespace-nowrap">
                                            <IconButton label={`Editar depósito del ${formatDate(deposit.depositDate)}`} disabled={busy || editing !== null} onPress={() => setEditing({ kind: "deposit", id: deposit.id })}><Pencil size={14} strokeWidth={2} /></IconButton>
                                            <RemoveButton disabled={busy} label={`depósito del ${formatDate(deposit.depositDate)}`} onRemove={() => { void run({ action: "remove", kind: "deposit", id: deposit.id }); }} />
                                        </td>
                                    </tr>
                                ))}
                            </Table>
                        </Panel>
                    </div>

                    <Panel title="Configuración" aside={
                        <BaseButton.Root variant="ghost" size="sm" onPress={() => setShowSettings((current) => !current)}>{showSettings ? "Ocultar" : "Mostrar"}</BaseButton.Root>
                    }>
                        {showSettings ? (
                            <div className="space-y-4">
                                <div className="grid gap-3 md:grid-cols-4">
                                    <SettingField label="Financiadora" value={view.settings.financierName} onCommit={(financierName) => { void saveSettings({ financierName }); }} />
                                    <SettingField label="% de contado (nuevas ventas)" value={view.settings.upfrontPercent} onCommit={(upfrontPercent) => { void saveSettings({ upfrontPercent }); }} />
                                    <SettingField label="% comisión (nuevos depósitos)" value={view.settings.commissionPercent} onCommit={(commissionPercent) => { void saveSettings({ commissionPercent }); }} />
                                    <div>
                                        <FieldLabel>Asientos</FieldLabel>
                                        <select value={view.settings.journalGranularity} onChange={(event) => { void saveSettings({ journalGranularity: event.target.value as "daily" | "monthly" }); }} className={INPUT_CLS}>
                                            <option value="monthly">Resumen mensual</option>
                                            <option value="daily">Por día</option>
                                        </select>
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 font-sans text-[12px] text-[var(--text-secondary)] cursor-pointer">
                                    <input type="checkbox" checked={view.settings.revalueMonthEnd} onChange={(event) => { void saveSettings({ revalueMonthEnd: event.target.checked }); }} />
                                    Registrar diferencial no realizado al cierre de cada mes (saldo pendiente en USD revaluado a la tasa BCV del último día, con reverso el día 1)
                                </label>
                                <div className="grid gap-3 md:grid-cols-3">
                                    {ROLES.map((role) => (
                                        <div key={role}>
                                            <FieldLabel>{ROLE_HINTS[role]}{ROLE_NOTES[role] ?? ""}</FieldLabel>
                                            <select value={view.settings.accounts[role] ?? ""} onChange={(event) => { void saveSettings({ accounts: { ...view.settings.accounts, [role]: event.target.value || undefined } }); }} className={INPUT_CLS}>
                                                <option value="">— Cuenta —</option>
                                                {postingAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)]">
                                    Los asientos se guardan como borrador en el libro diario y se actualizan solos con cada cambio. Un asiento ya publicado no se modifica: los cambios de ese mes deben ajustarse a mano.
                                </p>
                            </div>
                        ) : (
                            <p className="font-sans text-[12px] text-[var(--text-tertiary)]">
                                {view.settings.financierName} · {fmt(view.settings.upfrontPercent)}% contado · {fmt(view.settings.commissionPercent)}% comisión · asientos {view.settings.journalGranularity === "monthly" ? "mensuales" : "diarios"}{view.settings.revalueMonthEnd ? " · con diferencial no realizado" : ""} · {ROLES.filter((role) => view.settings.accounts[role]).map(accountLabel).join(" · ") || "sin cuentas asignadas"}
                            </p>
                        )}
                    </Panel>
                </>
            )}
        </div>
    );
}

function SyncBar({ journalSync, missingAccounts, busy, onResync, onConfigure }: {
    journalSync: FinancedSalesJournalSyncResult | null;
    missingAccounts: readonly FinancedSaleAccountRole[];
    busy: boolean;
    onResync: () => void;
    onConfigure: () => void;
}) {
    let message: string;
    let tone = "text-[var(--text-secondary)]";
    if (missingAccounts.length) {
        message = `Contabilidad pendiente: asigna las cuentas de ${missingAccounts.map((role) => ROLE_HINTS[role].toLowerCase()).join(", ")}.`;
        tone = "text-text-warning";
    } else if (!journalSync) {
        message = "Los asientos se sincronizan como borrador al registrar cambios.";
    } else if (journalSync.status === "synced") {
        message = `Contabilidad al día: ${journalSync.created} creados, ${journalSync.updated} actualizados, ${journalSync.removed} eliminados`
            + (journalSync.alreadyPosted ? ` · ${journalSync.alreadyPosted} ya publicados no se tocaron` : "")
            + (journalSync.monthsWithoutPeriod.length ? ` · sin período abierto: ${journalSync.monthsWithoutPeriod.map(monthLabel).join(", ")}` : "");
        tone = journalSync.monthsWithoutPeriod.length ? "text-text-warning" : "text-text-success";
    } else {
        message = `Contabilidad: ${journalSync.message ?? "falta configuración."}`;
        tone = "text-text-warning";
    }
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-light bg-surface-1 px-5 py-3">
            <span className={`flex items-center gap-2 font-sans text-[12px] ${tone}`}><BookCheck size={14} strokeWidth={2} />{message}</span>
            <div className="flex gap-2">
                {missingAccounts.length > 0 && <BaseButton.Root variant="secondary" size="sm" onPress={onConfigure}>Asignar cuentas</BaseButton.Root>}
                <BaseButton.Root variant="ghost" size="sm" leftIcon={<RefreshCw size={14} strokeWidth={2} />} loading={busy} isDisabled={missingAccounts.length > 0} onPress={onResync}>Sincronizar</BaseButton.Root>
                <BaseButton.Root as={Link} href="/accounting/journal" variant="ghost" size="sm">Libro diario</BaseButton.Root>
            </div>
        </div>
    );
}

function SettingField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
    return (
        <div>
            <FieldLabel>{label}</FieldLabel>
            <input key={value} defaultValue={value}
                onBlur={(event) => { const next = event.target.value.trim().replace(",", "."); if (next && next !== value) onCommit(next); }}
                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                className={INPUT_CLS} />
        </div>
    );
}

interface EditValues { date: string; amount: string; rate: string; reference: string }

/** Inline editor for a sale or deposit row; an empty rate means the BCV rate of the date. */
function EditRow({ initial, columns, busy, withReference = false, onSave, onCancel }: {
    initial: EditValues;
    columns: number;
    busy: boolean;
    withReference?: boolean;
    onSave: (values: EditValues) => void;
    onCancel: () => void;
}) {
    const [values, setValues] = useState(initial);
    const set = (field: keyof EditValues) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [field]: event.target.value }));
    return (
        <tr className="border-b border-border-light/50 bg-primary-500/[0.04]">
            <td colSpan={columns} className="px-3 py-2">
                <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); onSave(values); }}
                    onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}>
                    <div><FieldLabel>Fecha</FieldLabel><input type="date" required value={values.date} onChange={set("date")} className={`${INPUT_CLS} w-[150px]`} /></div>
                    <div><FieldLabel>Monto Bs</FieldLabel><input autoFocus inputMode="decimal" required value={values.amount} onChange={set("amount")} className={`${INPUT_CLS} w-[140px] text-right`} /></div>
                    <div><FieldLabel>Tasa (vacía = BCV)</FieldLabel><input inputMode="decimal" placeholder="BCV" value={values.rate} onChange={set("rate")} className={`${INPUT_CLS} w-[120px] text-right`} /></div>
                    {withReference && <div><FieldLabel>Referencia</FieldLabel><input value={values.reference} onChange={set("reference")} className={`${INPUT_CLS} w-[160px]`} /></div>}
                    <BaseButton.Root type="submit" variant="primary" size="sm" loading={busy} leftIcon={<Check size={14} strokeWidth={2} />}>Guardar</BaseButton.Root>
                    <BaseButton.Root variant="ghost" size="sm" leftIcon={<X size={14} strokeWidth={2} />} onPress={onCancel}>Cancelar</BaseButton.Root>
                </form>
            </td>
        </tr>
    );
}

function IconButton({ label, disabled, onPress, children }: { label: string; disabled: boolean; onPress: () => void; children: React.ReactNode }) {
    return (
        <button type="button" disabled={disabled} aria-label={label} title={label} onClick={onPress}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors disabled:opacity-40">
            {children}
        </button>
    );
}

function RemoveButton({ label, disabled, onRemove }: { label: string; disabled: boolean; onRemove: () => void }) {
    const [armed, setArmed] = useState(false);
    // Two clicks instead of a browser confirm dialog: the first arms, the second deletes.
    return (
        <button type="button" disabled={disabled} aria-label={`Eliminar ${label}`} title={armed ? "Haz clic de nuevo para eliminar" : `Eliminar ${label}`}
            onClick={() => { if (armed) { setArmed(false); onRemove(); } else { setArmed(true); } }}
            onBlur={() => setArmed(false)}
            className={["h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-40", armed ? "bg-red-500/15 text-[var(--text-error)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-error)] hover:bg-surface-2"].join(" ")}>
            <Trash2 size={14} strokeWidth={2} />
        </button>
    );
}
