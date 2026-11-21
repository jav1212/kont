"use client";

// Reconciles financier deposits recorded in the ledger with incoming movements
// of a Treasury bank account: suggests links for equal amounts on close dates
// and lets bank credits that were never recorded become ledger deposits.

import { useCallback, useMemo, useState } from "react";
import { Link2, Search } from "lucide-react";
import type { TreasuryQueryRequest, TreasuryReadRow } from "@kontave/client-contracts";
import { exactDecimal } from "@kontave/monetary/domain";
import { salesDate, suggestFinancierDepositMatches, type BankCreditCandidate } from "@kontave/sales/domain";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { createWebTreasuryClient } from "@/src/modules/treasury/frontend/treasury-client";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import { notify } from "@/src/shared/frontend/notify";
import { formatVes as fmt } from "@/src/modules/sales/shared/financed-sales-labels";
import { formatDate } from "./financed-sales-workbook";
import { Cell, FieldLabel, INPUT_CLS, Panel, Table } from "./financed-sales-ui";

interface BankAccountOption { id: string; label: string }
interface LedgerDeposit { id: string; depositDate: string; amountVes: string; bankEntryId: string | null }
type Row = TreasuryReadRow & Record<string, unknown>;

const PAGE_SIZE = 500;
const MAX_ROWS = 5000;
const daysBefore = (date: string, days: number) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - days);
    return value.toISOString().slice(0, 10);
};

export function FinancedSalesTreasuryReconciliation({ deposits, financierName, busy, onLink, onAddDeposits }: {
    deposits: readonly LedgerDeposit[];
    financierName: string;
    busy: boolean;
    onLink: (links: Array<{ depositId: string; bankEntryId: string | null }>) => Promise<boolean>;
    onAddDeposits: (deposits: Array<{ depositDate: string; amountVes: string; reference: string; bankEntryId: string }>) => Promise<boolean>;
}) {
    const { companyId } = useCompany();
    const { organization } = useOrganization();
    const client = useMemo(() => createWebTreasuryClient(async () => (await getSupabaseBrowser().auth.getSession()).data.session?.access_token ?? null).port, []);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
    const firstOpen = deposits.filter((deposit) => !deposit.bankEntryId).map((deposit) => deposit.depositDate).sort()[0];

    const [accounts, setAccounts] = useState<BankAccountOption[] | null>(null);
    const [accountId, setAccountId] = useState("");
    const [from, setFrom] = useState(() => daysBefore(firstOpen ?? today, firstOpen ? 7 : 60));
    const [to, setTo] = useState(today);
    const [conceptFilter, setConceptFilter] = useState(financierName);
    const [credits, setCredits] = useState<BankCreditCandidate[] | null>(null);
    const [selectedCredits, setSelectedCredits] = useState<ReadonlySet<string>>(new Set());
    const [loading, setLoading] = useState(false);

    const readAll = useCallback(async (request: Omit<TreasuryQueryRequest, "page" | "pageSize">): Promise<Row[]> => {
        if (!organization || !companyId) throw new Error("Selecciona una organización y empresa.");
        const rows: Row[] = [];
        for (let page = 1; rows.length < MAX_ROWS; page += 1) {
            const result = await client.query(organization.id, companyId, { ...request, page, pageSize: PAGE_SIZE } as TreasuryQueryRequest);
            rows.push(...(result.items as readonly Row[]));
            if (rows.length >= result.total || !result.items.length) break;
        }
        return rows;
    }, [client, companyId, organization]);

    async function loadAccounts() {
        setLoading(true);
        try {
            const rows = await readAll({ kind: "list_bank_accounts", currency: "VES", status: "active" } as Omit<TreasuryQueryRequest, "page" | "pageSize">);
            const options = rows.map((row) => ({ id: String(row.id), label: `${String(row.holderName ?? "")} ${String(row.accountNumberMasked ?? "")}`.trim() }));
            setAccounts(options);
            if (options.length === 1) setAccountId(options[0]!.id);
            if (!options.length) notify.warning("No hay cuentas bancarias en bolívares activas en Tesorería.");
        } catch (caught) {
            notify.failure(caught, "No se pudieron leer las cuentas bancarias de Tesorería.");
        } finally {
            setLoading(false);
        }
    }

    async function loadCredits() {
        if (!accountId) { notify.error("Selecciona la cuenta bancaria donde deposita la financiadora."); return; }
        setLoading(true);
        try {
            const rows = await readAll({ kind: "list_ledger_entries", accountKind: "bank_account", accountId, from, to, status: "posted" } as Omit<TreasuryQueryRequest, "page" | "pageSize">);
            const filter = conceptFilter.trim().toLowerCase();
            setCredits(rows
                .filter((row) => row.direction === "credit" && row.currency === "VES")
                .filter((row) => !filter || String(row.concept ?? "").toLowerCase().includes(filter))
                .map((row) => ({ id: String(row.id), date: salesDate(String(row.valueDate ?? row.operationalDate)), amountVes: exactDecimal(String(row.amount)), concept: String(row.concept ?? "") })));
            setSelectedCredits(new Set());
        } catch (caught) {
            notify.failure(caught, "No se pudieron leer los movimientos bancarios de Tesorería.");
        } finally {
            setLoading(false);
        }
    }

    const reconciliation = useMemo(() => credits ? suggestFinancierDepositMatches(
        deposits.map((deposit) => ({ id: deposit.id, depositDate: salesDate(deposit.depositDate), amountVes: exactDecimal(deposit.amountVes), bankEntryId: deposit.bankEntryId })),
        credits,
    ) : null, [credits, deposits]);
    const depositById = useMemo(() => new Map(deposits.map((deposit) => [deposit.id, deposit])), [deposits]);
    const creditById = useMemo(() => new Map((credits ?? []).map((credit) => [credit.id, credit])), [credits]);
    const linked = deposits.filter((deposit) => deposit.bankEntryId).length;

    async function linkSuggestions() {
        if (!reconciliation?.matches.length) return;
        if (await onLink(reconciliation.matches.map((match) => ({ depositId: match.depositId, bankEntryId: match.bankEntryId })))) {
            notify.success(`${reconciliation.matches.length} depósitos conciliados con Tesorería.`);
        }
    }

    async function registerSelected() {
        const chosen = (reconciliation?.unmatchedCredits ?? []).filter((credit) => selectedCredits.has(credit.id));
        if (!chosen.length) return;
        if (await onAddDeposits(chosen.map((credit) => ({ depositDate: credit.date, amountVes: credit.amountVes, reference: credit.concept.slice(0, 120), bankEntryId: credit.id })))) {
            notify.success(`${chosen.length} movimientos registrados como depósitos.`);
            setSelectedCredits(new Set());
        }
    }

    return (
        <Panel title="Conciliación con Tesorería" aside={`${linked} de ${deposits.length} depósitos conciliados`}>
            {!accounts ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-sans text-[12px] text-[var(--text-tertiary)]">Compara los depósitos registrados con los créditos de la cuenta bancaria en Tesorería: vincula los que coinciden y registra los que falten.</p>
                    <BaseButton.Root variant="secondary" size="sm" leftIcon={<Search size={14} strokeWidth={2} />} loading={loading} onPress={() => { void loadAccounts(); }}>Conciliar</BaseButton.Root>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid items-end gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                        <div>
                            <FieldLabel>Cuenta bancaria</FieldLabel>
                            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className={INPUT_CLS}>
                                <option value="">— Cuenta —</option>
                                {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
                            </select>
                        </div>
                        <div><FieldLabel>Desde</FieldLabel><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={INPUT_CLS} /></div>
                        <div><FieldLabel>Hasta</FieldLabel><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={INPUT_CLS} /></div>
                        <div><FieldLabel>Concepto contiene</FieldLabel><input value={conceptFilter} onChange={(event) => setConceptFilter(event.target.value)} placeholder="(todos)" className={INPUT_CLS} /></div>
                        <BaseButton.Root variant="primary" size="sm" loading={loading} onPress={() => { void loadCredits(); }}>Buscar</BaseButton.Root>
                    </div>

                    {reconciliation && (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="font-sans text-[12px] text-[var(--text-secondary)]">
                                    {reconciliation.matches.length} coincidencias · {reconciliation.unmatchedDepositIds.length} depósitos sin movimiento · {reconciliation.unmatchedCredits.length} movimientos sin registrar
                                </span>
                                <BaseButton.Root variant="primary" size="sm" leftIcon={<Link2 size={14} strokeWidth={2} />} loading={busy} isDisabled={!reconciliation.matches.length} onPress={() => { void linkSuggestions(); }}>
                                    Vincular {reconciliation.matches.length || ""}
                                </BaseButton.Root>
                            </div>
                            {reconciliation.matches.length > 0 && (
                                <Table headers={["Depósito", "Monto Bs", "Movimiento", "Concepto", "Días"]}>
                                    {reconciliation.matches.map((match) => {
                                        const deposit = depositById.get(match.depositId)!;
                                        const credit = creditById.get(match.bankEntryId)!;
                                        return (
                                            <tr key={match.depositId} className="border-b border-border-light/50">
                                                <Cell left>{formatDate(deposit.depositDate)}</Cell>
                                                <Cell>{fmt(deposit.amountVes)}</Cell>
                                                <Cell left>{formatDate(credit.date)}</Cell>
                                                <Cell left>{credit.concept}</Cell>
                                                <Cell>{match.dayGap}</Cell>
                                            </tr>
                                        );
                                    })}
                                </Table>
                            )}
                            {reconciliation.unmatchedDepositIds.length > 0 && (
                                <p className="font-sans text-[12px] text-text-warning">
                                    Sin movimiento bancario en el período: {reconciliation.unmatchedDepositIds.slice(0, 12).map((id) => { const deposit = depositById.get(id)!; return `${formatDate(deposit.depositDate)} Bs. ${fmt(deposit.amountVes)}`; }).join(" · ")}{reconciliation.unmatchedDepositIds.length > 12 ? " …" : ""}
                                </p>
                            )}
                            {reconciliation.unmatchedCredits.length > 0 && (
                                <div className="space-y-2">
                                    <Table headers={["", "Fecha", "Monto Bs", "Concepto"]}>
                                        {reconciliation.unmatchedCredits.map((credit) => (
                                            <tr key={credit.id} className="border-b border-border-light/50">
                                                <td className="px-3 py-1.5">
                                                    <input type="checkbox" aria-label={`Registrar movimiento del ${formatDate(credit.date)}`} checked={selectedCredits.has(credit.id)}
                                                        onChange={(event) => setSelectedCredits((current) => { const next = new Set(current); if (event.target.checked) next.add(credit.id); else next.delete(credit.id); return next; })} />
                                                </td>
                                                <Cell left>{formatDate(credit.date)}</Cell>
                                                <Cell>{fmt(credit.amountVes)}</Cell>
                                                <Cell left>{credit.concept}</Cell>
                                            </tr>
                                        ))}
                                    </Table>
                                    <div className="flex justify-end">
                                        <BaseButton.Root variant="secondary" size="sm" loading={busy} isDisabled={!selectedCredits.size} onPress={() => { void registerSelected(); }}>
                                            Registrar {selectedCredits.size || ""} como depósitos
                                        </BaseButton.Root>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </Panel>
    );
}
