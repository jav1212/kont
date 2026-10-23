"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Banknote, BookOpenCheck, CircleDollarSign, Clock3, WalletCards } from "lucide-react";
import type { TreasuryBankAccountRow, TreasuryBalanceRow, TreasuryCashBoxRow } from "@/src/modules/treasury/frontend/treasury-rows";
import { addDecimal, exactDecimal } from "@kontave/monetary/domain";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
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
  const [error, setError] = useState<string | null>(null);
  const asOf = filters.asOf || today();

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError(null);
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
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el resumen de Tesorería.");
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

  return <main className="space-y-6 p-4 sm:p-6">
    <PageHeader title="Tesorería" subtitle="Saldos y tareas pendientes de caja y bancos" />
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-default-200 bg-content1 p-4">
      <p className="text-sm text-default-500">Empresa activa: <span className="font-medium text-foreground">{companyId ?? "Selecciona una empresa"}</span></p>
      <label className="grid gap-1 text-sm">Saldo al día<input type="date" value={asOf} onChange={(event) => setFilters({ asOf: event.target.value }, "replace")} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
    </div>
    {error && <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error}</p>}
    <section aria-label="Resumen operativo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[{ title: "Cheques emitidos", value: counts.checks }, { title: "Por entregar", value: counts.deliveries }, { title: "Borradores", value: counts.drafts }, { title: "Órdenes pendientes", value: counts.orders }, { title: "Partidas sin conciliar", value: counts.unreconciled }].map((item) => <article key={item.title} className="rounded-xl border border-default-200 bg-content1 p-4"><p className="text-sm text-default-500">{item.title}</p><p className="mt-2 text-2xl font-semibold">{loading ? "…" : item.value}</p></article>)}
    </section>
    <section className="rounded-xl border border-default-200 bg-content1 p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Saldo por moneda</h2><p className="text-sm text-default-500">Saldos al {asOf}</p></div><CircleDollarSign className="text-primary" /></div>{Object.keys(balancesByCurrency).length === 0 ? <p className="text-sm text-default-500">{catalogs.loading || loading ? "Cargando saldos…" : "No hay cuentas registradas."}</p> : <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(balancesByCurrency).map(([currency, balance]) => <div key={currency} className="rounded-lg bg-default-100 p-4"><dt className="text-sm text-default-500">{currency}</dt><dd className="mt-1 text-xl font-semibold">{formatExactMoney(balance)}</dd></div>)}</dl>}</section>
    <section className="rounded-xl border border-default-200 bg-content1 p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Saldos por cuenta</h2><Link href="/treasury/accounts" className="text-sm text-primary underline">Ver todas</Link></div>{catalogs.error && <p role="alert" className="mb-3 text-sm text-danger">{catalogs.error}</p>}<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{catalogs.accounts.map((account: TreasuryAccount) => <li key={account.id}><Link href={`/treasury/accounts/${encodeURIComponent(account.id)}`} className="block rounded-lg border border-default-200 p-4 hover:border-primary"><p className="text-sm text-default-500">{account.rowKind === "cash_box" ? "Caja" : "Banco"} · {account.currency}</p><p className="mt-1 font-medium">{"holderName" in account ? account.holderName : `${account.name} · ${account.code}`}</p><p className="mt-2 text-lg font-semibold">{balances.find((balance) => balance.accountId === account.id)?.balance ?? "—"} {account.currency}</p></Link></li>)}</ul></section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{links.map(({ href, label, detail, icon: Icon }) => <Link key={href} href={href} className="rounded-xl border border-default-200 bg-content1 p-4 hover:border-primary"><Icon className="mb-3 text-primary" /><p className="font-medium">{label}</p><p className="mt-1 text-sm text-default-500">{detail}</p></Link>)}<Link href="/treasury/reports" className="rounded-xl border border-default-200 bg-content1 p-4 hover:border-primary"><Clock3 className="mb-3 text-primary" /><p className="font-medium">Reportes</p><p className="mt-1 text-sm text-default-500">Exportaciones por período</p></Link></section>
  </main>;
}
