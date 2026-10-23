"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Banknote, BookOpenCheck, CircleDollarSign, Clock3, WalletCards } from "lucide-react";
import type { TreasuryBankAccountRow, TreasuryBalanceRow, TreasuryCashBoxRow } from "@/src/modules/treasury/frontend/treasury-rows";
import { addDecimal, exactDecimal } from "@kontave/monetary/domain";
import { TreasuryPageFrame } from "@/src/modules/treasury/frontend/components/treasury-page-frame";
import { TreasuryInput, notifyTreasuryFailure } from "@/src/modules/treasury/frontend/components/treasury-form-controls";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { useTreasuryContext } from "@/src/modules/treasury/frontend/context/treasury-context";
import { useTreasuryCatalogs } from "@/src/modules/treasury/frontend/hooks/use-treasury-catalogs";
import { useTreasuryFilters } from "@/src/modules/treasury/frontend/hooks/use-treasury-filters";

type TreasuryAccount = TreasuryBankAccountRow | TreasuryCashBoxRow;
type AccountBalance = TreasuryBalanceRow & { readonly accountId: string };

const today = (): string => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

function formatExactMoney(value: string): string {
  const [whole, fraction = ""] = exactDecimal(value).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction ? `${grouped},${fraction.padEnd(2, "0")}` : `${grouped},00`;
}

/** Shows current balances and actionable Treasury work without loading operational detail tables.
 * @returns A company-scoped Treasury dashboard with filtered summaries and capability links.
 */
export default function TreasuryPage(): React.JSX.Element {
  const { companyId, query, revision } = useTreasuryContext();
  const catalogs = useTreasuryCatalogs();
  const { filters, setFilters } = useTreasuryFilters({ asOf: today() });
  const { can } = useOrganizationModuleAccess("/treasury");
  const [balances, setBalances] = useState<readonly AccountBalance[]>([]);
  const [counts, setCounts] = useState({ checks: 0, deliveries: 0, drafts: 0, orders: 0, unreconciled: 0 });
  const [loading, setLoading] = useState(false);
  const asOf = filters.asOf || today();

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const accounts = catalogs.accounts;
      const asOfBalances = await Promise.all(accounts.map(async (account): Promise<AccountBalance> => {
        const accountKind = account.rowKind === "cash_box" ? "cash_box" : "bank_account";
        const result = await query<TreasuryBalanceRow>({ kind: "get_balance", accountKind, accountId: account.id, asOf, page: 1, pageSize: 1 });
        return result.items[0] ?? { rowKind: "balance", accountId: account.id, accountKind, currency: account.currency, balance: "0" };
      }));
      const bankAccounts = accounts.filter((account): account is TreasuryBankAccountRow => account.rowKind === "bank_account");
      const summaryRows = await Promise.all([
        query({ kind: "list_checks", status: "issued", page: 1, pageSize: 1 }),
        query({ kind: "list_check_deliveries", status: "pending", page: 1, pageSize: 1 }),
        ...accounts.map((account) => query({ kind: "list_ledger_entries", accountKind: account.rowKind, accountId: account.id, from: "2000-01-01", to: asOf, status: "draft", page: 1, pageSize: 1 })),
        ...bankAccounts.flatMap((account) => (["statement_pending", "ledger_pending", "ambiguous"] as const).map((state) => query({ kind: "list_reconciliation_items", bankAccountId: account.id, state, page: 1, pageSize: 1 }))),
      ]);
      const checks = summaryRows[0].total;
      const deliveries = summaryRows[1].total;
      const accountSummaryStart = 2;
      const accountSummaryEnd = accountSummaryStart + accounts.length;
      const drafts = summaryRows.slice(accountSummaryStart, accountSummaryEnd).reduce((sum, item) => sum + item.total, 0);
      const unreconciled = summaryRows.slice(accountSummaryEnd).reduce((sum, item) => sum + item.total, 0);
      let orders = 0;
      if (can("payment_orders.read")) {
        const response = await fetch(`/api/security/payment-orders?companyId=${encodeURIComponent(companyId)}&offset=0&limit=1`, { cache: "no-store" });
        if (response.ok) {
          const payload = await response.json() as { data?: { total?: number } };
          orders = payload.data?.total ?? 0;
        }
      }
      setBalances(asOfBalances);
      setCounts({ checks, deliveries, drafts, orders, unreconciled });
    } catch (cause: unknown) {
      notifyTreasuryFailure(cause, "No se pudo cargar el resumen de Tesorería.", "treasury:dashboard");
    } finally { setLoading(false); }
  }, [asOf, can, catalogs.accounts, companyId, query]);

  useEffect(() => { void load(); }, [load, revision]);

  const balancesByCurrency = useMemo(() => balances.reduce<Record<string, string>>((totals, item) => {
    totals[item.currency] = addDecimal(exactDecimal(totals[item.currency] ?? "0"), exactDecimal(item.balance));
    return totals;
  }, {}), [balances]);

  const links = [
    { href: "/treasury/movements", label: "Registrar movimiento", icon: ArrowLeftRight, detail: "Libro, borradores y reversos" },
    { href: "/treasury/checks", label: "Gestionar cheques", icon: Banknote, detail: "Emisión y entregas" },
    { href: "/treasury/accounts", label: "Cajas y cuentas", icon: WalletCards, detail: "Saldos y catálogos" },
    { href: "/treasury/reconciliation", label: "Conciliar banco", icon: BookOpenCheck, detail: "Extractos y partidas pendientes" },
  ];

  return <TreasuryPageFrame title="Tesorería" description="Saldos y tareas pendientes de caja y bancos" toolbar={<TreasuryInput label="Saldo al día" type="date" value={asOf} onChange={(value) => setFilters({ asOf: value }, "replace")} />}>
    <section aria-label="Resumen operativo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[{ title: "Cheques emitidos", value: counts.checks }, { title: "Por entregar", value: counts.deliveries }, { title: "Borradores", value: counts.drafts }, { title: "Órdenes pendientes", value: counts.orders }, { title: "Partidas sin conciliar", value: counts.unreconciled }].map((item) => <article key={item.title} className="rounded-xl border border-border-light bg-surface-1 p-4"><p className="text-sm text-[var(--text-secondary)]">{item.title}</p><p className="mt-2 text-2xl font-semibold">{loading ? "…" : item.value}</p></article>)}
    </section>
    <section className="rounded-xl border border-border-light bg-surface-1 p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Saldo por moneda</h2><p className="text-sm text-[var(--text-secondary)]">Saldos al {asOf}</p></div><CircleDollarSign className="text-primary" /></div>{Object.keys(balancesByCurrency).length === 0 ? <p className="text-sm text-[var(--text-secondary)]">{catalogs.loading || loading ? "Cargando saldos…" : "No hay cuentas registradas."}</p> : <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(balancesByCurrency).map(([currency, balance]) => <div key={currency} className="rounded-lg bg-surface-2 p-4"><dt className="text-sm text-[var(--text-secondary)]">{currency}</dt><dd className="mt-1 text-xl font-semibold">{formatExactMoney(balance)}</dd></div>)}</dl>}</section>
    <section className="rounded-xl border border-border-light bg-surface-1 p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Saldos por cuenta</h2><Link href="/treasury/accounts" className="text-sm text-primary underline">Ver todas</Link></div>{catalogs.failed && <div className="mb-3 flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]"><span>No se pudieron cargar las cuentas.</span><button type="button" onClick={() => void catalogs.refresh()} className="underline">Reintentar</button></div>}<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{catalogs.accounts.map((account: TreasuryAccount) => <li key={account.id}><Link href={`/treasury/accounts/${encodeURIComponent(account.id)}`} className="block rounded-lg border border-border-light p-4 hover:border-primary"><p className="text-sm text-[var(--text-secondary)]">{account.rowKind === "cash_box" ? "Caja" : "Banco"} · {account.currency}</p><p className="mt-1 font-medium">{"holderName" in account ? account.holderName : `${account.name} · ${account.code}`}</p><p className="mt-2 text-lg font-semibold">{balances.find((balance) => balance.accountId === account.id) ? formatExactMoney(balances.find((balance) => balance.accountId === account.id)?.balance ?? "0") : "—"} {account.currency}</p></Link></li>)}</ul></section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{links.map(({ href, label, detail, icon: Icon }) => <Link key={href} href={href} className="rounded-xl border border-border-light bg-surface-1 p-4 hover:border-primary"><Icon className="mb-3 text-primary" /><p className="font-medium">{label}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{detail}</p></Link>)}<Link href="/treasury/reports" className="rounded-xl border border-border-light bg-surface-1 p-4 hover:border-primary"><Clock3 className="mb-3 text-primary" /><p className="font-medium">Reportes</p><p className="mt-1 text-sm text-[var(--text-secondary)]">Exportaciones por período</p></Link></section>
  </TreasuryPageFrame>;
}
