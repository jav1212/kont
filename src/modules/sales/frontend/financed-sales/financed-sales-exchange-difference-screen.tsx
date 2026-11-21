"use client";

// Screen: realized exchange difference of sales financed by a third party
// (Cashea). Imports the daily financed-sales workbook and, optionally, the
// financier deposits; values each sale at the BCV rate of its date and shows
// the detail, monthly totals and proposed journal entries.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, BookCheck, Download, FileSpreadsheet, Landmark, TrendingUp, Upload } from "lucide-react";
import { decimalToFixed, exactDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import { salesDate, type FinancedSaleAccountRole, type FinancedSaleCollection } from "@kontave/sales/domain";
import {
    BuildFinancedSalesExchangeDifferenceReport,
    buildFinancedSalesJournal,
    type FinancedSaleReportLine,
    type FinancedSalesExchangeDifferenceReport,
} from "@kontave/sales/application";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { StatTile } from "@/src/shared/frontend/components/stat-tile";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { usePostingAccounts } from "@/src/modules/accounting/frontend/hooks/use-posting-accounts";
import { useAccountingPeriods } from "@/src/modules/accounting/frontend/hooks/use-accounting-periods";
import { createWebAccountingClient } from "@/src/modules/accounting/frontend/accounting-client";
import type { JournalEntry } from "@/src/modules/accounting/backend/domain/journal-entry";
import { notify } from "@/src/shared/frontend/notify";
import { BcvUsdRateHistory } from "./bcv-usd-rate-history";
import {
    downloadFinancedSaleCollectionsTemplate,
    downloadFinancedSalesReportWorkbook,
    formatDate,
    readFinancedSaleCollectionsWorkbook,
    readFinancedSalesWorkbook,
    type AccountRoleLabels,
    type ImportedFinancedSale,
} from "./financed-sales-workbook";
import {
    loadCompanyJournal,
    planFinancedSalesJournalPublication,
    publishFinancedSalesJournal,
    type RoleAccounts,
} from "./financed-sales-journal-publication";

const DEFAULT_ROLE_LABELS: AccountRoleLabels = {
    bank: "Banco",
    financier_receivable: "Cuentas por cobrar Cashea",
    sales: "Ventas",
    exchange_gain: "Diferencial cambiario (ingreso)",
    exchange_loss: "Diferencial cambiario (egreso)",
};
const ROLE_ORDER: readonly FinancedSaleAccountRole[] = ["bank", "financier_receivable", "sales", "exchange_gain", "exchange_loss"];
const MODE_LABELS = { actual: "Real", estimated: "Estimado", pending: "Pendiente" } as const;
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const fmt = (value: ExactDecimal | string, digits = 2) =>
    Number(decimalToFixed(value as ExactDecimal, digits)).toLocaleString("es-VE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const monthLabel = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month} ${month.slice(0, 4)}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });

type ManualCollection = { collectedOn: string; receivedVes: string };
const describeMonth = (kind: "sale" | "collection", month: string) =>
    kind === "sale" ? `Ventas financiadas ${monthLabel(month)}` : `Cobros financiadora ${monthLabel(month)}`;
const accountsStorageKey = (companyId: string) => `kont-financed-sales-accounts:${companyId}`;

export function FinancedSalesExchangeDifferenceScreen() {
    const { company, companyId } = useCompany();
    const { organization } = useOrganization();
    const { data: postingAccounts } = usePostingAccounts(organization?.id ?? null, companyId);
    const { data: periods } = useAccountingPeriods(companyId);
    const rates = useRef(new BcvUsdRateHistory());
    const salesInput = useRef<HTMLInputElement>(null);
    const collectionsInput = useRef<HTMLInputElement>(null);

    const [sales, setSales] = useState<ImportedFinancedSale[]>([]);
    const [importedCollections, setImportedCollections] = useState<Record<string, FinancedSaleCollection[]>>({});
    const [manualCollections, setManualCollections] = useState<Record<string, ManualCollection>>({});
    const [rateOverrides, setRateOverrides] = useState<Record<string, string>>({});
    const [upfrontPercent, setUpfrontPercent] = useState("60");
    const [settlementDays, setSettlementDays] = useState("14");
    const [asOf, setAsOf] = useState(today);
    const [accounts, setAccounts] = useState<RoleAccounts>({});
    const [includeEstimated, setIncludeEstimated] = useState(false);
    const [journalView, setJournalView] = useState<"monthly" | "daily">("monthly");
    const [existingEntries, setExistingEntries] = useState<JournalEntry[] | null>(null);
    const [publishing, setPublishing] = useState(false);
    const [report, setReport] = useState<FinancedSalesExchangeDifferenceReport | null>(null);
    const [loading, setLoading] = useState(false);

    const lines = useMemo<FinancedSaleReportLine[]>(() => sales.map((sale) => {
        const manual = manualCollections[sale.reference];
        const collections = manual
            ? [{ collectedOn: salesDate(manual.collectedOn), receivedVes: exactDecimal(manual.receivedVes) }]
            : importedCollections[sale.reference] ?? [];
        const override = rateOverrides[sale.reference];
        return {
            reference: sale.reference,
            saleDate: salesDate(sale.saleDate),
            saleAmountVes: exactDecimal(sale.amountVes),
            ...(override ? { saleVesPerUsd: exactDecimal(override) } : {}),
            collections,
        };
    }), [sales, manualCollections, importedCollections, rateOverrides]);

    useEffect(() => {
        if (!lines.length) { setReport(null); return; }
        const percent = validDecimal(upfrontPercent);
        const days = Number(settlementDays);
        if (!percent || !Number.isInteger(days) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return;
        let cancelled = false;
        setLoading(true);
        new BuildFinancedSalesExchangeDifferenceReport(rates.current)
            .execute(lines, { upfrontPercent: percent, estimatedSettlementDays: days, asOf: salesDate(asOf) })
            .then((result) => { if (!cancelled) setReport(result); })
            .catch((error) => { if (!cancelled) notify.failure(error, "No se pudo calcular el diferencial cambiario."); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [lines, upfrontPercent, settlementDays, asOf]);

    async function handleSalesFile(file: File | undefined) {
        if (!file) return;
        try {
            const result = await readFinancedSalesWorkbook(file);
            setSales(result.items);
            setManualCollections({});
            setRateOverrides({});
            result.warnings.forEach((warning) => notify.warning(warning));
            if (result.items.length) notify.success(`${result.items.length} ventas importadas.`);
        } catch (error) {
            notify.failure(error, "No se pudo leer el archivo de ventas.");
        }
    }

    async function handleCollectionsFile(file: File | undefined) {
        if (!file) return;
        try {
            const result = await readFinancedSaleCollectionsWorkbook(file);
            const grouped: Record<string, FinancedSaleCollection[]> = {};
            for (const item of result.items) {
                (grouped[item.saleReference] ??= []).push({
                    collectedOn: salesDate(item.collectedOn),
                    receivedVes: exactDecimal(item.receivedVes),
                    ...(item.vesPerUsd ? { vesPerUsd: exactDecimal(item.vesPerUsd) } : {}),
                });
            }
            const unmatched = Object.keys(grouped).filter((reference) => !sales.some((sale) => sale.reference === reference));
            if (unmatched.length) notify.warning(`${unmatched.length} cobros no coinciden con ninguna fecha de venta importada.`);
            setImportedCollections(grouped);
            result.warnings.forEach((warning) => notify.warning(warning));
            if (result.items.length) notify.success(`${result.items.length} cobros importados.`);
        } catch (error) {
            notify.failure(error, "No se pudo leer el archivo de cobros.");
        }
    }

    // Restores the last account mapping of the company, falling back to the
    // exchange-difference special account configured in Accounting.
    useEffect(() => {
        if (!companyId) return;
        let cancelled = false;
        void (async () => {
            let stored: RoleAccounts = {};
            try { stored = JSON.parse(localStorage.getItem(accountsStorageKey(companyId)) ?? "{}") as RoleAccounts; } catch { /* Storage is a convenience only. */ }
            if ((!stored.exchange_gain || !stored.exchange_loss) && organization) {
                try {
                    const settings = await createWebAccountingClient().query(organization.id, companyId, { kind: "get_accounting_settings" }) as { specialAccounts?: Record<string, string> };
                    const exchange = settings.specialAccounts?.exchange_difference;
                    if (exchange) stored = { exchange_gain: exchange, exchange_loss: exchange, ...stored };
                } catch { /* Without settings the accountant picks the accounts manually. */ }
            }
            if (!cancelled) setAccounts(stored);
        })();
        return () => { cancelled = true; };
    }, [companyId, organization]);

    const reloadExistingEntries = useCallback(async () => {
        if (!companyId) return;
        try {
            setExistingEntries(await loadCompanyJournal(companyId));
        } catch (caught) {
            setExistingEntries(null);
            notify.failure(caught, "No se pudieron leer los asientos contables existentes.", { useFallbackMessage: true });
        }
    }, [companyId]);

    // Read once a report exists; edits to the report do not change the journal.
    const hasReport = report !== null;
    useEffect(() => {
        let cancelled = false;
        if (companyId && hasReport) {
            void loadCompanyJournal(companyId)
                .then((entries) => { if (!cancelled) setExistingEntries(entries); })
                .catch(() => { if (!cancelled) setExistingEntries(null); });
        }
        return () => { cancelled = true; };
    }, [companyId, hasReport]);

    function assignAccount(role: FinancedSaleAccountRole, accountId: string) {
        setAccounts((current) => {
            const next = { ...current, [role]: accountId || undefined };
            if (companyId) {
                try { localStorage.setItem(accountsStorageKey(companyId), JSON.stringify(next)); } catch { /* Storage is a convenience only. */ }
            }
            return next;
        });
    }

    const roleLabels = useMemo<AccountRoleLabels>(() => {
        const labels = { ...DEFAULT_ROLE_LABELS };
        for (const role of ROLE_ORDER) {
            const account = postingAccounts.find((candidate) => candidate.id === accounts[role]);
            if (account) labels[role] = `${account.code} · ${account.name}`;
        }
        return labels;
    }, [accounts, postingAccounts]);

    const journals = useMemo(() => {
        if (!report) return { daily: [], monthly: [] };
        return {
            daily: buildFinancedSalesJournal(report.rows, { granularity: "daily", includeEstimated, describeMonth }),
            monthly: buildFinancedSalesJournal(report.rows, { granularity: "monthly", includeEstimated, describeMonth }),
        };
    }, [report, includeEstimated]);
    const journal = journalView === "monthly" ? journals.monthly : journals.daily;

    const plan = useMemo(
        () => existingEntries ? planFinancedSalesJournalPublication(journal, journalView, accounts, periods, existingEntries) : null,
        [journal, journalView, accounts, periods, existingEntries],
    );
    const planCounts = useMemo(() => {
        const counts = { create: 0, update: 0, already_posted: 0, no_open_period: 0 };
        plan?.items.forEach((item) => { counts[item.action.kind] += 1; });
        return counts;
    }, [plan]);
    const monthsWithoutPeriod = useMemo(
        () => [...new Set(plan?.items.filter((item) => item.action.kind === "no_open_period").map((item) => monthLabel(item.entry.date.slice(0, 7))) ?? [])],
        [plan],
    );
    const publishable = planCounts.create + planCounts.update;
    const blocked = !plan || plan.missingRoles.length > 0 || plan.conflictingEntries > 0 || publishable === 0;

    async function handlePublish() {
        if (!plan || !companyId || blocked) return;
        setPublishing(true);
        try {
            const result = await publishFinancedSalesJournal(plan, companyId, accounts);
            if (result.created || result.updated) {
                notify.success(`Asientos en borrador: ${result.created} creados, ${result.updated} actualizados.`);
            }
            if (result.failures.length) {
                const first = result.failures[0]!;
                notify.error(`${result.failures.length} asientos no se guardaron. Primero: ${first.entry.description} — ${first.error}`);
            }
        } catch (caught) {
            notify.failure(caught, "No se pudieron publicar los asientos.");
        } finally {
            setPublishing(false);
            await reloadExistingEntries();
        }
    }

    function handleExport() {
        if (!report) return;
        const name = (company?.name ?? "empresa").replace(/[^\w-]+/g, "-").toLowerCase();
        downloadFinancedSalesReportWorkbook(report, journals, roleLabels, `diferencial-cambiario-${name}-${asOf}.xlsx`);
        notify.success("Reporte exportado a Excel.");
    }

    const net = report ? Number(report.totals.realizedGainVes) - Number(report.totals.realizedLossVes) : 0;
    const failed = report?.rows.filter((row) => row.status === "failed").length ?? 0;

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Diferencial cambiario" subtitle="Ventas financiadas (Cashea) · cobro diferido a tasa BCV">
                {report && (
                    <BaseButton.Root variant="primary" size="sm" leftIcon={<Download size={14} strokeWidth={2} />} onPress={handleExport}>
                        Exportar Excel
                    </BaseButton.Root>
                )}
            </PageHeader>

            <div className="px-8 py-6 space-y-6">
                <Panel title="Datos y supuestos">
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <FieldLabel>Ventas financiadas</FieldLabel>
                            <input ref={salesInput} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { void handleSalesFile(event.target.files?.[0]); event.target.value = ""; }} />
                            <BaseButton.Root variant="secondary" size="sm" fullWidth leftIcon={<Upload size={14} strokeWidth={2} />} onPress={() => salesInput.current?.click()}>
                                {sales.length ? `${sales.length} ventas · cambiar archivo` : "Importar Excel de ventas"}
                            </BaseButton.Root>
                        </div>
                        <div className="space-y-2">
                            <FieldLabel>Cobros de la financiadora (opcional)</FieldLabel>
                            <input ref={collectionsInput} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { void handleCollectionsFile(event.target.files?.[0]); event.target.value = ""; }} />
                            <div className="flex gap-2">
                                <BaseButton.Root variant="secondary" size="sm" fullWidth leftIcon={<Upload size={14} strokeWidth={2} />} onPress={() => collectionsInput.current?.click()} isDisabled={!sales.length}>
                                    {Object.keys(importedCollections).length ? `${Object.keys(importedCollections).length} fechas con cobro` : "Importar cobros"}
                                </BaseButton.Root>
                                <BaseButton.Root variant="ghost" size="sm" leftIcon={<FileSpreadsheet size={14} strokeWidth={2} />} onPress={downloadFinancedSaleCollectionsTemplate}>
                                    Plantilla
                                </BaseButton.Root>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <NumberField label="% contado" value={upfrontPercent} onCommit={setUpfrontPercent} />
                            <NumberField label="Días cobro" value={settlementDays} onCommit={setSettlementDays} />
                            <div>
                                <FieldLabel>Corte</FieldLabel>
                                <input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className={INPUT_CLS} />
                            </div>
                        </div>
                    </div>
                    <p className="mt-4 font-sans text-[12px] leading-snug text-[var(--text-tertiary)]">
                        Cada venta se valora a la tasa BCV vigente en su fecha. Si una venta no tiene cobro real, se estima su cobro a la tasa BCV de la fecha de venta + {settlementDays || "N"} días;
                        si esa fecha es posterior al corte, queda pendiente. El diferencial es lo cobrado en Bs menos el saldo de la cuenta por cobrar en Bs históricos.
                    </p>
                </Panel>

                {!sales.length ? (
                    <div className="rounded-xl border border-dashed border-border-light bg-surface-1 px-5 py-16 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                        Importa el Excel de ventas a crédito Cashea (una fila por día, cualquier cantidad de hojas) para calcular el diferencial cambiario.
                    </div>
                ) : !report ? (
                    <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">{loading ? "Consultando tasas BCV y calculando…" : "Sin datos."}</div>
                ) : (
                    <>
                        <div className="grid gap-4 md:grid-cols-4">
                            <StatTile label="Ventas" value={`Bs. ${fmt(report.totals.saleAmountVes)}`} sublabel={`${report.rows.length} días`} icon={Landmark} />
                            <StatTile label="Financiado" value={`Bs. ${fmt(report.totals.financedVes)}`} sublabel={`Saldo: Bs. ${fmt(report.totals.outstandingCarriedVes)}`} icon={ArrowLeftRight} tone="muted" />
                            <StatTile label="Cobrado" value={`Bs. ${fmt(report.totals.collectedVes)}`} sublabel={failed ? `${failed} filas con error` : "Cobros reales y estimados"} icon={Download} tone={failed ? "warning" : "default"} />
                            <StatTile label="Diferencial neto" value={`Bs. ${fmt(String(net))}`} sublabel={`Pérdidas: Bs. ${fmt(report.totals.realizedLossVes)}`} icon={TrendingUp} tone={net >= 0 ? "success" : "warning"} />
                        </div>

                        <Panel title="Resumen mensual" aside={loading ? "Recalculando…" : "El diferencial se reconoce en el mes del cobro"}>
                            <Table headers={["Mes", "Ventas", "Contado", "Financiado", "Cobrado", "Ganancia", "Pérdida", "Saldo"]}>
                                {report.months.map((month) => (
                                    <tr key={month.month} className="border-b border-border-light/50 hover:bg-surface-2">
                                        <Cell left>{monthLabel(month.month)}</Cell>
                                        <Cell>{fmt(month.saleAmountVes)}</Cell>
                                        <Cell>{fmt(month.upfrontVes)}</Cell>
                                        <Cell>{fmt(month.financedVes)}</Cell>
                                        <Cell>{fmt(month.collectedVes)}</Cell>
                                        <Cell tone="success">{fmt(month.realizedGainVes)}</Cell>
                                        <Cell tone="warning">{fmt(month.realizedLossVes)}</Cell>
                                        <Cell>{fmt(month.outstandingCarriedVes)}</Cell>
                                    </tr>
                                ))}
                            </Table>
                        </Panel>

                        <Panel title="Detalle por venta" aside="Edita fecha y monto cobrado, o la tasa de la venta">
                            <Table headers={["Fecha venta", "Venta Bs", "Tasa venta", "Contado Bs", "Financiado Bs", "Financiado USD", "Fecha cobro", "Cobrado Bs", "Tasa implícita", "Diferencial Bs", "Origen"]}>
                                {report.rows.map((row) => {
                                    const reference = row.line.reference;
                                    if (row.status === "failed") {
                                        return (
                                            <tr key={reference} className="border-b border-border-light/50">
                                                <Cell left>{formatDate(row.line.saleDate)}</Cell>
                                                <Cell>{fmt(row.line.saleAmountVes)}</Cell>
                                                <td className="px-3 py-1.5"><EditableCell value={rateOverrides[reference] ?? ""} placeholder="Tasa" onCommit={(value) => setRateOverrides((current) => withValue(current, reference, value))} /></td>
                                                <td colSpan={8} className="px-3 py-1.5 font-sans text-[12px] text-text-warning">{row.reason}</td>
                                            </tr>
                                        );
                                    }
                                    const s = row.settlement;
                                    const collection = s.collections[s.collections.length - 1];
                                    const editable = s.collections.length <= 1;
                                    return (
                                        <tr key={reference} className="border-b border-border-light/50 hover:bg-surface-2">
                                            <Cell left>{formatDate(s.terms.saleDate)}{reference.includes("#") ? ` (${reference.split("#")[1]})` : ""}</Cell>
                                            <Cell>{fmt(s.terms.saleAmountVes)}</Cell>
                                            <td className="px-3 py-1.5"><EditableCell value={rateOverrides[reference] ?? decimalToFixed(s.terms.saleVesPerUsd, 4)} onCommit={(value) => setRateOverrides((current) => withValue(current, reference, value))} /></td>
                                            <Cell>{fmt(s.upfrontVes)}</Cell>
                                            <Cell>{fmt(s.financedVes)}</Cell>
                                            <Cell>{fmt(s.financedUsd)}</Cell>
                                            <td className="px-3 py-1.5">
                                                {editable ? (
                                                    <input type="date" value={manualCollections[reference]?.collectedOn ?? (row.collectionMode === "pending" ? "" : collection?.collectedOn ?? "")}
                                                        onChange={(event) => {
                                                            const collectedOn = event.target.value;
                                                            setManualCollections((current) => {
                                                                const receivedVes = current[reference]?.receivedVes ?? collection?.receivedVes ?? s.financedVes;
                                                                return collectedOn ? { ...current, [reference]: { collectedOn, receivedVes } } : withoutKey(current, reference);
                                                            });
                                                        }}
                                                        className={`${INPUT_CLS} h-8 w-[136px]`} />
                                                ) : <span className="text-[12px]">{s.collections.length} cobros</span>}
                                            </td>
                                            <td className="px-3 py-1.5">
                                                {editable ? (
                                                    <EditableCell value={manualCollections[reference]?.receivedVes ?? (row.collectionMode === "pending" ? "" : collection?.receivedVes ?? "")}
                                                        placeholder="Bs"
                                                        onCommit={(value) => setManualCollections((current) => {
                                                            const collectedOn = current[reference]?.collectedOn ?? collection?.collectedOn;
                                                            return value && collectedOn ? { ...current, [reference]: { collectedOn, receivedVes: value } } : withoutKey(current, reference);
                                                        })} />
                                                ) : fmt(s.collections.reduce((total, item) => total + Number(item.receivedVes), 0).toFixed(2))}
                                            </td>
                                            <Cell>{collection ? fmt(collection.impliedVesPerUsd, 4) : "—"}</Cell>
                                            <Cell tone={Number(s.exchangeDifference) < 0 ? "warning" : Number(s.exchangeDifference) > 0 ? "success" : undefined}>{s.collections.length ? fmt(s.exchangeDifference) : "—"}</Cell>
                                            <Cell left>
                                                <span className={["rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em]", manualCollections[reference] || row.collectionMode === "actual" ? "bg-success/10 text-text-success" : row.collectionMode === "estimated" ? "bg-warning/10 text-text-warning" : "bg-surface-2 text-[var(--text-tertiary)]"].join(" ")}>
                                                    {manualCollections[reference] ? "Manual" : MODE_LABELS[row.collectionMode]}
                                                </span>
                                            </Cell>
                                        </tr>
                                    );
                                })}
                            </Table>
                        </Panel>

                        <Panel title="Asientos propuestos" aside={
                            <div className="inline-flex rounded-lg border border-border-light overflow-hidden">
                                {(["monthly", "daily"] as const).map((view, index) => (
                                    <button key={view} type="button" onClick={() => setJournalView(view)}
                                        className={["px-3 h-7 text-[10px] uppercase tracking-[0.12em]", index > 0 ? "border-l border-border-light" : "", journalView === view ? "bg-primary-500/10 text-primary-500 font-bold" : "text-[var(--text-secondary)] hover:bg-surface-2"].join(" ")}>
                                        {view === "monthly" ? "Resumen mensual" : "Por día"}
                                    </button>
                                ))}
                            </div>
                        }>
                            <div className="mb-4 grid gap-2 md:grid-cols-5">
                                {ROLE_ORDER.map((role) => (
                                    <div key={role}>
                                        <FieldLabel>{ROLE_HINTS[role]}</FieldLabel>
                                        <select value={accounts[role] ?? ""} onChange={(event) => assignAccount(role, event.target.value)} className={INPUT_CLS}>
                                            <option value="">— Cuenta —</option>
                                            {postingAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border-light bg-surface-2/50 px-4 py-3">
                                <div className="space-y-1.5 font-sans text-[12px] text-[var(--text-secondary)]">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={includeEstimated} onChange={(event) => setIncludeEstimated(event.target.checked)} />
                                        Incluir cobros estimados (no recomendado: no son depósitos reales)
                                    </label>
                                    {plan ? (
                                        <p>
                                            {journalView === "monthly" ? "Resumen mensual" : "Por día"}: {planCounts.create} nuevos · {planCounts.update} borradores a actualizar
                                            {planCounts.already_posted > 0 && ` · ${planCounts.already_posted} ya publicados (no se tocan)`}
                                            {planCounts.no_open_period > 0 && ` · ${planCounts.no_open_period} sin período abierto (${monthsWithoutPeriod.join(", ")})`}
                                        </p>
                                    ) : <p>Leyendo los asientos existentes en Contabilidad…</p>}
                                    {plan && plan.missingRoles.length > 0 && (
                                        <p className="text-text-warning">Asigna una cuenta a: {plan.missingRoles.map((role) => ROLE_HINTS[role]).join(", ")}.</p>
                                    )}
                                    {plan && plan.conflictingEntries > 0 && (
                                        <p className="text-text-warning">
                                            Ya hay {plan.conflictingEntries} asientos de este reporte publicados en modo {journalView === "monthly" ? "por día" : "mensual"}. Elimínalos en el libro diario o publica en ese modo para no registrar los hechos dos veces.
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <BaseButton.Root as={Link} href="/accounting/journal" variant="ghost" size="sm">Ver libro diario</BaseButton.Root>
                                    <BaseButton.Root variant="primary" size="sm" leftIcon={<BookCheck size={14} strokeWidth={2} />} loading={publishing} isDisabled={blocked} onPress={() => { void handlePublish(); }}>
                                        Publicar {publishable || ""} en borrador
                                    </BaseButton.Root>
                                </div>
                            </div>
                            <Table headers={["N°", "Fecha", "Descripción", "Cuenta", "Debe", "Haber"]}>
                                {journal.flatMap((entry, index) => entry.lines.map((line, lineIndex) => (
                                    <tr key={`${entry.key}-${line.role}`} className={["border-border-light/50", lineIndex === entry.lines.length - 1 ? "border-b" : ""].join(" ")}>
                                        <Cell left>{lineIndex === 0 ? index + 1 : ""}</Cell>
                                        <Cell left>{lineIndex === 0 ? formatDate(entry.date) : ""}</Cell>
                                        <Cell left>{lineIndex === 0 ? entry.description : ""}</Cell>
                                        <Cell left>{Number(line.credit) > 0 ? <span className="pl-6">{roleLabels[line.role]}</span> : roleLabels[line.role]}</Cell>
                                        <Cell>{Number(line.debit) > 0 ? fmt(line.debit) : ""}</Cell>
                                        <Cell>{Number(line.credit) > 0 ? fmt(line.credit) : ""}</Cell>
                                    </tr>
                                )))}
                            </Table>
                        </Panel>
                    </>
                )}
            </div>
        </div>
    );
}

const ROLE_HINTS: Record<FinancedSaleAccountRole, string> = {
    bank: "Cuenta banco",
    financier_receivable: "Cuenta por cobrar financiadora",
    sales: "Cuenta de ventas",
    exchange_gain: "Ganancia cambiaria",
    exchange_loss: "Pérdida cambiaria",
};

const INPUT_CLS = "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground tabular-nums focus:border-primary-500/60";

function validDecimal(value: string): ExactDecimal | null {
    try { return exactDecimal(value.replace(",", ".")); } catch { return null; }
}

function withValue(current: Record<string, string>, key: string, value: string): Record<string, string> {
    const normalized = value.trim().replace(",", ".");
    if (!normalized || !validDecimal(normalized) || Number(normalized) <= 0) return withoutKey(current, key);
    return { ...current, [key]: normalized };
}

function withoutKey<T>(current: Record<string, T>, key: string): Record<string, T> {
    const { [key]: _removed, ...rest } = current;
    return rest;
}

function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <section className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
            <div className="px-5 py-3 border-b border-border-light flex items-center justify-between gap-4">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">{title}</h2>
                {typeof aside === "string" ? <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{aside}</span> : aside}
            </div>
            <div className="p-5">{children}</div>
        </section>
    );
}

function FieldLabel({ children }: { children: ReactNode }) {
    return <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1">{children}</label>;
}

function NumberField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
    return (
        <div>
            <FieldLabel>{label}</FieldLabel>
            <EditableCell value={value} onCommit={(next) => { if (next.trim()) onCommit(next.trim().replace(",", ".")); }} />
        </div>
    );
}

/** Text input that commits on blur or Enter, so the report is not recalculated on every keystroke. */
function EditableCell({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (value: string) => void }) {
    // Keyed by the committed value so an external change resets the uncontrolled draft.
    return (
        <input key={value} defaultValue={value} placeholder={placeholder} inputMode="decimal"
            onBlur={(event) => { if (event.target.value !== value) onCommit(event.target.value); }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
            className={`${INPUT_CLS} h-8 min-w-[96px] text-right`} />
    );
}

function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
    return (
        <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-[13px]">
                <thead>
                    <tr className="border-b border-border-light bg-surface-2/50">
                        {headers.map((header, index) => (
                            <th key={header} className={["px-3 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap", index === 0 ? "text-left" : "text-right"].join(" ")}>{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

function Cell({ children, left, tone }: { children: ReactNode; left?: boolean; tone?: "success" | "warning" }) {
    return (
        <td className={["px-3 py-1.5 tabular-nums whitespace-nowrap", left ? "text-left" : "text-right", tone === "success" ? "text-text-success" : tone === "warning" ? "text-text-warning" : "text-foreground"].join(" ")}>
            {children}
        </td>
    );
}
