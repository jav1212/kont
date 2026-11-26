"use client";

// Screen: realized exchange difference of sales financed by a third party
// (Cashea). Imports the calculator template (sale date, days or collection
// date, financed amount and currency) or the legacy daily workbook in Bs,
// values each sale at the BCV rate of its date and its collection at the BCV
// rate of the collection date, and shows the detail, monthly totals and
// proposed journal entries.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, BookCheck, Download, FileSpreadsheet, Landmark, TrendingUp, Upload } from "lucide-react";
import { decimalToFixed, exactDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import { exchangeDifferencePercentOf, salesDate, type FinancedSaleAccountRole } from "@kontave/sales/domain";
import {
    BuildFinancedSalesExchangeDifferenceReport,
    buildFinancedSalesJournal,
    countFinancedSalesPublication,
    planFinancedSalesJournalPublication,
    type FinancedSaleRoleAccounts as RoleAccounts,
    type FinancedSaleReportLine,
    type FinancedSalesExchangeDifferenceReport,
} from "@kontave/sales/application";
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
    downloadFinancedSalesCalculatorTemplate,
    downloadFinancedSalesReportWorkbook,
    formatDate,
    readFinancedSalesWorkbook,
    type AccountRoleLabels,
} from "./financed-sales-workbook";
import { readForeignCurrencyCollectionsTemplate } from "../foreign-currency-collections/foreign-currency-collections-workbook";
import { loadCompanyJournal, publishFinancedSalesJournal } from "./financed-sales-journal-publication";
import { Cell, EditableCell, FieldLabel, INPUT_CLS, NumberField, Panel, Table } from "./financed-sales-ui";
import { DEFAULT_ROLE_LABELS, ROLE_HINTS, describeFinancedSalesMonth as describeMonth, formatVes as fmt, monthLabel } from "@/src/modules/sales/shared/financed-sales-labels";

const ROLE_ORDER: readonly FinancedSaleAccountRole[] = ["bank", "financier_receivable", "sales", "exchange_gain", "exchange_loss"];
const MODE_LABELS = { actual: "Fecha indicada", estimated: "Estimado", pending: "Pendiente" } as const;

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });

/** One imported financed sale; `settledOn` is null when the default term applies. */
interface CalculatorSale {
    reference: string;
    saleDate: string;
    amount: string;
    currency: "VES" | "USD";
    settledOn: string | null;
    vesPerUsd: string | null;
}

const accountsStorageKey = (companyId: string) => `kont-financed-sales-accounts:${companyId}`;

export function FinancedSalesExchangeDifferenceScreen() {
    const { company, companyId } = useCompany();
    const { organization } = useOrganization();
    const { data: postingAccounts } = usePostingAccounts(organization?.id ?? null, companyId);
    const { data: periods } = useAccountingPeriods(companyId);
    const rates = useRef(new BcvUsdRateHistory());
    const salesInput = useRef<HTMLInputElement>(null);

    const [sales, setSales] = useState<CalculatorSale[]>([]);
    const [rateOverrides, setRateOverrides] = useState<Record<string, string>>({});
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
        const override = rateOverrides[sale.reference] ?? sale.vesPerUsd;
        return {
            reference: sale.reference,
            saleDate: salesDate(sale.saleDate),
            ...(sale.currency === "USD" ? { saleAmountUsd: exactDecimal(sale.amount) } : { saleAmountVes: exactDecimal(sale.amount) }),
            ...(sale.settledOn ? { settledOn: salesDate(sale.settledOn) } : {}),
            ...(override ? { saleVesPerUsd: exactDecimal(override) } : {}),
        };
    }), [sales, rateOverrides]);

    useEffect(() => {
        if (!lines.length) { setReport(null); return; }
        const days = Number(settlementDays);
        if (!Number.isInteger(days) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return;
        let cancelled = false;
        setLoading(true);
        // The template amount is what the financier owes, so nothing is paid upfront.
        new BuildFinancedSalesExchangeDifferenceReport(rates.current)
            .execute(lines, { upfrontPercent: exactDecimal("0"), estimatedSettlementDays: days, asOf: salesDate(asOf) })
            .then((result) => { if (!cancelled) setReport(result); })
            .catch((error) => { if (!cancelled) notify.failure(error, "No se pudo calcular el diferencial cambiario."); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [lines, settlementDays, asOf]);

    async function handleSalesFile(file: File | undefined) {
        if (!file) return;
        try {
            // The legacy daily workbook (date and amount in Bs) remains accepted.
            const template = await readForeignCurrencyCollectionsTemplate(file);
            const result = template
                ? {
                    warnings: template.warnings,
                    items: template.items.map((item): CalculatorSale => ({
                        reference: item.reference, saleDate: item.collectedOn, amount: item.amount, currency: item.currency, settledOn: item.paidOn, vesPerUsd: item.vesPerUsd,
                    })),
                }
                : await readFinancedSalesWorkbook(file).then(({ items, warnings }) => ({
                    warnings,
                    items: items.map((item): CalculatorSale => ({
                        reference: item.reference, saleDate: item.saleDate, amount: item.amountVes, currency: "VES", settledOn: null, vesPerUsd: null,
                    })),
                }));
            setSales(result.items);
            setRateOverrides({});
            result.warnings.forEach((warning) => notify.warning(warning));
            if (result.items.length) notify.success(`${result.items.length} ventas importadas.`);
        } catch (error) {
            notify.failure(error, "No se pudo leer el archivo de ventas.");
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
        () => existingEntries ? planFinancedSalesJournalPublication(journal, { channel: "calculator", granularity: journalView }, accounts, periods, existingEntries) : null,
        [journal, journalView, accounts, periods, existingEntries],
    );
    const planCounts = useMemo(
        () => plan ? countFinancedSalesPublication(plan) : { create: 0, update: 0, already_posted: 0, no_open_period: 0 },
        [plan],
    );
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
        <div className="font-mono">
            <div className="px-8 py-6 space-y-6">
                {report && (
                    <div className="flex justify-end">
                        <BaseButton.Root variant="primary" size="sm" leftIcon={<Download size={14} strokeWidth={2} />} onPress={handleExport}>
                            Exportar Excel
                        </BaseButton.Root>
                    </div>
                )}
                <Panel title="Datos">
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2 md:col-span-2">
                            <FieldLabel>Ventas financiadas</FieldLabel>
                            <input ref={salesInput} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { void handleSalesFile(event.target.files?.[0]); event.target.value = ""; }} />
                            <div className="flex gap-2">
                                <BaseButton.Root variant="secondary" size="sm" fullWidth leftIcon={<Upload size={14} strokeWidth={2} />} onPress={() => salesInput.current?.click()}>
                                    {sales.length ? `${sales.length} ventas · cambiar archivo` : "Importar Excel"}
                                </BaseButton.Root>
                                <BaseButton.Root variant="ghost" size="sm" leftIcon={<FileSpreadsheet size={14} strokeWidth={2} />} onPress={downloadFinancedSalesCalculatorTemplate}>
                                    Plantilla
                                </BaseButton.Root>
                            </div>
                        </div>
                        <NumberField label="Días hasta el cobro" value={settlementDays} onCommit={setSettlementDays} />
                        <div>
                            <FieldLabel>Corte</FieldLabel>
                            <input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className={INPUT_CLS} />
                        </div>
                    </div>
                    <p className="mt-4 font-sans text-[12px] leading-snug text-[var(--text-tertiary)]">
                        Cada fila es un monto financiado (en USD o Bs) que se registra a la tasa BCV de la fecha de venta y se cobra a la tasa BCV de la fecha de cobro.
                        La plantilla indica por fila los días o la fecha de cobro; las filas sin ninguno de los dos se estiman a {settlementDays || "N"} días.
                        Si el cobro es posterior al corte, queda pendiente. El diferencial es lo cobrado en Bs menos lo registrado.
                    </p>
                </Panel>

                {!sales.length ? (
                    <div className="rounded-xl border border-dashed border-border-light bg-surface-1 px-5 py-16 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                        Descarga la plantilla y llénala con la fecha de venta, los días o la fecha de cobro y el monto financiado con su moneda.
                    </div>
                ) : !report ? (
                    <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">{loading ? "Consultando tasas BCV y calculando…" : "Sin datos."}</div>
                ) : (
                    <>
                        <div className="grid gap-4 md:grid-cols-4">
                            <StatTile label="Financiado" value={`Bs. ${fmt(report.totals.financedVes)}`} sublabel={`${report.rows.length} ventas`} icon={Landmark} />
                            <StatTile label="Pendiente" value={`Bs. ${fmt(report.totals.outstandingCarriedVes)}`} sublabel="Cobros posteriores al corte" icon={ArrowLeftRight} tone="muted" />
                            <StatTile label="Cobrado" value={`Bs. ${fmt(report.totals.collectedVes)}`} sublabel={failed ? `${failed} filas con error` : "Cobros indicados y estimados"} icon={Download} tone={failed ? "warning" : "default"} />
                            <StatTile label="Diferencial neto" value={`Bs. ${fmt(String(net))}`} sublabel={`Pérdidas: Bs. ${fmt(report.totals.realizedLossVes)}`} icon={TrendingUp} tone={net >= 0 ? "success" : "warning"} />
                        </div>

                        <Panel title="Resumen mensual" aside={loading ? "Recalculando…" : "El diferencial se reconoce en el mes del cobro"}>
                            <Table headers={["Mes", "Financiado", "Cobrado", "Ganancia", "Pérdida", "Saldo"]}>
                                {report.months.map((month) => (
                                    <tr key={month.month} className="border-b border-border-light/50 hover:bg-surface-2">
                                        <Cell left>{monthLabel(month.month)}</Cell>
                                        <Cell>{fmt(month.financedVes)}</Cell>
                                        <Cell>{fmt(month.collectedVes)}</Cell>
                                        <Cell tone="success">{fmt(month.realizedGainVes)}</Cell>
                                        <Cell tone="warning">{fmt(month.realizedLossVes)}</Cell>
                                        <Cell>{fmt(month.outstandingCarriedVes)}</Cell>
                                    </tr>
                                ))}
                            </Table>
                        </Panel>

                        <Panel title="Detalle por venta" aside="Edita la tasa de la venta si el sistema usó otra">
                            <Table headers={["Fecha venta", "Monto", "Tasa venta", "Financiado Bs", "USD", "Fecha cobro", "Tasa cobro", "Cobrado Bs", "Diferencial Bs", "%", "Origen"]}>
                                {report.rows.map((row) => {
                                    const reference = row.line.reference;
                                    const usd = row.line.saleAmountUsd;
                                    const amount = usd !== undefined ? `$ ${fmt(usd)}` : row.line.saleAmountVes ? `Bs. ${fmt(row.line.saleAmountVes)}` : "—";
                                    if (row.status === "failed") {
                                        return (
                                            <tr key={reference} className="border-b border-border-light/50">
                                                <Cell left>{formatDate(row.line.saleDate)}</Cell>
                                                <Cell>{amount}</Cell>
                                                <td className="px-3 py-1.5"><EditableCell value={rateOverrides[reference] ?? ""} placeholder="Tasa" onCommit={(value) => setRateOverrides((current) => withValue(current, reference, value))} /></td>
                                                <td colSpan={8} className="px-3 py-1.5 font-sans text-[12px] text-text-warning">{row.reason}</td>
                                            </tr>
                                        );
                                    }
                                    const s = row.settlement;
                                    const collection = s.collections[s.collections.length - 1];
                                    const difference = Number(s.exchangeDifference);
                                    const tone = difference < 0 ? "warning" as const : difference > 0 ? "success" as const : undefined;
                                    return (
                                        <tr key={reference} className="border-b border-border-light/50 hover:bg-surface-2">
                                            <Cell left>{formatDate(s.terms.saleDate)}{reference.includes("#") ? ` (${reference.split("#")[1]})` : ""}</Cell>
                                            <Cell>{amount}</Cell>
                                            <td className="px-3 py-1.5"><EditableCell value={rateOverrides[reference] ?? decimalToFixed(s.terms.saleVesPerUsd, 4)} onCommit={(value) => setRateOverrides((current) => withValue(current, reference, value))} /></td>
                                            <Cell>{fmt(s.financedVes)}</Cell>
                                            <Cell>{fmt(s.financedUsd)}</Cell>
                                            <Cell>{collection ? formatDate(collection.collectedOn) : "—"}</Cell>
                                            <Cell>{collection ? fmt(collection.impliedVesPerUsd, 4) : "—"}</Cell>
                                            <Cell>{collection ? fmt(collection.receivedVes) : "—"}</Cell>
                                            <Cell tone={tone}>{collection ? fmt(s.exchangeDifference) : "—"}</Cell>
                                            <Cell tone={tone}>{collection ? `${fmt(exchangeDifferencePercentOf(s.exchangeDifference, s.financedVes))} %` : "—"}</Cell>
                                            <Cell left>
                                                <span className={["rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em]", row.collectionMode === "actual" ? "bg-success/10 text-text-success" : row.collectionMode === "estimated" ? "bg-warning/10 text-text-warning" : "bg-surface-2 text-[var(--text-tertiary)]"].join(" ")}>
                                                    {MODE_LABELS[row.collectionMode]}
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
                                        Incluir cobros estimados (filas sin días ni fecha de cobro)
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
                                            Ya hay {plan.conflictingEntries} asientos de ventas financiadas publicados en otro modo o desde el libro Cashea. Elimínalos en el libro diario o publica en ese modo para no registrar los hechos dos veces.
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

function validDecimal(value: string): ExactDecimal | null {
    try { return exactDecimal(value.replace(",", ".")); } catch { return null; }
}

function withValue(current: Record<string, string>, key: string, value: string): Record<string, string> {
    const normalized = value.trim().replace(",", ".");
    if (!normalized || !validDecimal(normalized) || Number(normalized) <= 0) {
        const { [key]: _removed, ...rest } = current;
        return rest;
    }
    return { ...current, [key]: normalized };
}
