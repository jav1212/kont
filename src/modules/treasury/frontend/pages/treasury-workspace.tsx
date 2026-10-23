"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { useTreasuryContext } from "@/src/modules/treasury/frontend/context/treasury-context";
import { useTreasuryCatalogs } from "@/src/modules/treasury/frontend/hooks/use-treasury-catalogs";
import { useTreasuryCommand } from "@/src/modules/treasury/frontend/hooks/use-treasury-command";
import { useTreasuryFilters } from "@/src/modules/treasury/frontend/hooks/use-treasury-filters";
import { CheckDeliveryBatch } from "@/src/modules/treasury/frontend/components/check-delivery-batch";
import { DepositForm } from "@/src/modules/treasury/frontend/components/deposit-form";
import { PaymentOrderExecution } from "@/src/modules/treasury/frontend/components/payment-order-execution";
import { TreasuryInput as Input, TreasurySelect as Select, treasuryAccountLabel as label, treasuryErrorMessage, treasuryToday as today } from "@/src/modules/treasury/frontend/components/treasury-form-controls";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { renderTreasuryCsv, renderTreasuryPdf, type TreasuryReportSnapshot } from "@kontave/treasury/application";
import { JsPdfTreasuryReportRenderer } from "@kontave/treasury/pdf";
import type { TreasuryQueryRequest, TreasuryReadRow } from "@kontave/client-contracts";
import type { TreasuryBalanceRow, TreasuryReportRow } from "@/src/modules/treasury/frontend/treasury-rows";

type Kind = "accounts" | "account" | "movements" | "checks" | "deposits" | "checkbooks" | "beneficiaries" | "payments" | "reports";
type CheckTab = "issued" | "pending" | "history";
type RowAction = "publish" | "reverse" | "deliver" | "undo";
const checkTabs: readonly (readonly [CheckTab, string])[] = [["issued", "Emitidos"], ["pending", "Por entregar"], ["history", "Historial de entregas"]];
const reportTitles = { cash_ledger: "Libro de caja", bank_ledger: "Libro de bancos", balances: "Saldos", checks: "Cheques", deposits: "Depósitos", payments: "Pagos de órdenes", reconciliation: "Conciliaciones" } as const;
const reportColumns: Readonly<Record<keyof typeof reportTitles, readonly string[]>> = {
  cash_ledger: ["id", "accountId", "direction", "amount", "currency", "movementType", "operationalDate", "valueDate", "concept", "status", "sourceType", "sourceId"],
  bank_ledger: ["id", "accountId", "direction", "amount", "currency", "movementType", "operationalDate", "valueDate", "concept", "status", "sourceType", "sourceId"],
  balances: ["accountId", "accountKind", "currency", "balance", "asOfDate"],
  checks: ["id", "checkbookId", "bankAccountId", "number", "beneficiaryId", "amount", "currency", "issueDate", "status", "ledgerEntryId"],
  deposits: ["id", "destinationBankAccountId", "sourceAccountKind", "sourceAccountId", "amount", "currency", "depositDate", "reference", "sourceLedgerEntryId", "destinationLedgerEntryId"],
  payments: ["paymentId", "paymentOrderId", "beneficiaryId", "accountKind", "accountId", "amount", "currency", "method", "valueDate", "ledgerEntryId"],
  reconciliation: ["matchId", "bankAccountId", "statementLineId", "ledgerEntryId", "matchType", "ruleSetId", "ruleVersion", "reason", "statementAmount", "statementCurrency", "statementDate", "statementReference", "ledgerAmount", "ledgerCurrency", "ledgerDate", "ledgerReference"],
};

function download(bytes: Uint8Array, fileName: string, mediaType: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.click();
  URL.revokeObjectURL(url);
}

/** Renders a focused Treasury capacity with typed read rows and available safe writes.
 * @param props - Capacity and optional account from the route.
 * @returns The current company's Treasury workspace.
 */
export function TreasuryWorkspace({ kind, accountId }: { readonly kind: Kind; readonly accountId?: string }): React.JSX.Element {
  const { user } = useAuth(); const { query, revision } = useTreasuryContext(); const catalogs = useTreasuryCatalogs(); const command = useTreasuryCommand();
  const { can } = useOrganizationModuleAccess("/treasury");
  const { filters, setFilters } = useTreasuryFilters({ account: "", from: "2000-01-01", to: today(), status: "", tab: "issued", page: "1", report: "bank_ledger", format: "csv" });
  const [rows, setRows] = useState<readonly TreasuryReadRow[]>([]); const [total, setTotal] = useState(0); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false); const [open, setOpen] = useState(false);
  const [accountBalance, setAccountBalance] = useState<TreasuryBalanceRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ currency: "VES", date: today(), direction: "credit", movementType: "bank_movement" }); const put = (key: string, value: string) => setForm((v) => ({ ...v, [key]: value }));
  const account = accountId ?? filters.account; const page = Math.max(1, Number(filters.page) || 1); const selected = catalogs.accounts.find((item) => item.id === account);
  const checkTab: CheckTab = filters.tab === "pending" || filters.tab === "history" ? filters.tab : "issued";
  const spec = useMemo(() => {
    const common = { title: "", description: "", empty: "No hay registros.", request: null as Omit<TreasuryQueryRequest, "page" | "pageSize"> | null };
    if (kind === "accounts") return { ...common, title: "Cajas y cuentas", description: "Cuentas operativas de la empresa.", request: { kind: "list_bank_accounts" } };
    if (kind === "movements" || kind === "account") return { ...common, title: kind === "account" ? "Detalle de cuenta" : "Movimientos", description: "Libro por cuenta, período y estado.", empty: "Selecciona una cuenta.", request: account ? { kind: "list_ledger_entries", accountKind: selected?.rowKind === "cash_box" ? "cash_box" : "bank_account", accountId: account, from: filters.from, to: filters.to, ...(filters.status ? { status: filters.status as "draft" | "posted" | "reversed" } : {}) } : null };
    if (kind === "checks") return checkTab === "history"
      ? { ...common, title: "Cheques", description: "Entregas y anulaciones registradas.", empty: "No hay entregas registradas.", request: { kind: "list_check_deliveries", ...(account ? { bankAccountId: account } : {}) } }
      : { ...common, title: "Cheques", description: "Cheques emitidos por cuenta y estado.", request: { kind: "list_checks", ...(account ? { bankAccountId: account } : {}), ...(filters.status ? { status: filters.status } : {}) } };
    if (kind === "deposits") return { ...common, title: "Depósitos", description: "Depósitos confirmados.", request: { kind: "list_deposits", ...(account ? { destinationBankAccountId: account } : {}), from: filters.from, to: filters.to } };
    if (kind === "checkbooks") return { ...common, title: "Chequeras", description: "Folios y disponibilidad.", request: { kind: "list_checkbooks", ...(account ? { bankAccountId: account } : {}) } };
    if (kind === "beneficiaries") return { ...common, title: "Beneficiarios", description: "Destinatarios y referencias enmascaradas.", request: { kind: "list_beneficiaries", ...(filters.status ? { status: filters.status as "active" | "inactive" } : {}) } };
    // Payments and reports own their reads; the generic results table is not rendered for them.
    if (kind === "payments") return { ...common, title: "Órdenes y pagos", description: "Período del historial de liquidaciones." };
    return { ...common, title: "Reportes", description: "Snapshots autorizados por período, cuenta y moneda." };
  }, [account, checkTab, filters.from, filters.status, filters.to, kind, selected?.rowKind]);
  const tableVisible = spec.request !== null || kind === "movements" || kind === "account";
  const load = useCallback(async () => {
    if (!spec.request || (kind === "checks" && checkTab === "pending")) { setRows([]); setTotal(0); return; }
    setLoading(true); setError(null);
    try {
      if (kind === "accounts") {
        const [cashBoxes, bankAccounts] = await Promise.all([
          query<TreasuryReadRow>({ kind: "list_cash_boxes", page, pageSize: 50 }),
          query<TreasuryReadRow>({ kind: "list_bank_accounts", page, pageSize: 50 }),
        ]);
        setRows([...cashBoxes.items, ...bankAccounts.items]); setTotal(cashBoxes.total + bankAccounts.total);
      } else {
        const result = await query<TreasuryReadRow>({ ...spec.request, page, pageSize: 50 } as TreasuryQueryRequest);
        setRows(result.items); setTotal(result.total);
      }
    } catch (cause) { setError(treasuryErrorMessage(cause, "No se pudo cargar Tesorería.")); }
    finally { setLoading(false); }
  }, [checkTab, kind, page, query, spec.request]);
  useEffect(() => { void load(); }, [load, revision]);
  useEffect(() => {
    if (kind !== "account" || !selected) { setAccountBalance(null); return; }
    let active = true;
    void query<TreasuryBalanceRow>({ kind: "get_balance", accountKind: selected.rowKind, accountId: selected.id, asOf: filters.to, page: 1, pageSize: 1 })
      .then((result) => { if (active) setAccountBalance(result.items[0] ?? null); })
      .catch((cause: unknown) => { if (active) setError(treasuryErrorMessage(cause, "No se pudo consultar el saldo de la cuenta.")); });
    return () => { active = false; };
  }, [filters.to, kind, query, revision, selected]);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); try { await command.execute((identity, id) => {
    const money = { amount: form.amount, currency: form.currency || "VES" };
    if (kind === "accounts") { if (form.type === "cash") return { ...identity, kind: "create_cash_box", cashBoxId: id, code: form.code, name: form.name, currency: form.currency, responsibleActorId: user?.id ?? "" }; if (form.type === "bank") return { ...identity, kind: "create_bank", bankId: id, code: form.code, name: form.name, countryCode: form.countryCode || "VE" }; return { ...identity, kind: "create_bank_account", bankAccountId: id, bankId: form.bankId, currency: form.currency, holderName: form.name, accountNumber: form.accountNumber, allowOverdraft: false }; }
    if (kind === "beneficiaries") return { ...identity, kind: "create_beneficiary", beneficiaryId: id, legalName: form.name, ...(form.tax ? { taxIdentifier: form.tax } : {}) };
    if (kind === "checkbooks") return { ...identity, kind: "create_checkbook", checkbookId: id, bankAccountId: form.bankAccountId, firstNumber: Number(form.first), lastNumber: Number(form.last) };
    if (kind === "movements" && selected) return { ...identity, kind: "create_ledger_draft", entryId: id, account: { kind: selected.rowKind, id: selected.id, currency: selected.currency }, direction: form.direction as "credit" | "debit", money, operationalDate: form.date, valueDate: form.date, concept: form.concept, movementType: form.movementType as "cash_movement" | "cash_income" | "cash_expense" | "bank_movement" | "bank_debit" | "bank_credit" };
    if (kind === "checks") { const cb = catalogs.checkbooks.find((item) => item.id === form.checkbookId); const ba = catalogs.accounts.find((item) => item.id === cb?.bankAccountId); const ben = catalogs.beneficiaries.find((item) => item.id === form.beneficiaryId); if (!cb || !ba || ba.rowKind !== "bank_account" || !ben) throw new Error("Selecciona los datos requeridos."); return { ...identity, kind: "issue_check", checkId: id, checkbookId: cb.id, bankAccountId: ba.id, number: cb.nextNumber, beneficiaryId: ben.id, beneficiarySnapshot: ben.legalName, money: { amount: form.amount, currency: ba.currency }, issueDate: form.date, concept: form.concept, expectedCheckbookVersion: cb.version, expectedBankAccountVersion: ba.version }; }
    throw new Error("Operación no disponible."); }, `create:${kind}`); setOpen(false); } catch (cause) { setError(treasuryErrorMessage(cause, "No se pudo guardar.")); } };
  const runRowAction = async (row: TreasuryReadRow, action: RowAction) => {
    // Prompts run before the command so a retry of the same row reuses its identity without asking again.
    let reason = ""; let recipientName = ""; let evidenceReference = "";
    if (action === "reverse" || action === "undo") { reason = window.prompt(action === "reverse" ? "Motivo de la reversión:" : "Motivo de anulación de entrega:")?.trim() ?? ""; if (!reason) { setError("Indica el motivo."); return; } }
    if (action === "deliver") { recipientName = window.prompt("Recibido por:")?.trim() ?? ""; if (!recipientName) { setError("Indica quién recibió el cheque."); return; } evidenceReference = window.prompt("Evidencia (opcional):")?.trim() ?? ""; }
    const rowId = "id" in row ? row.id : "";
    try { await command.execute((identity, id) => {
      if (action === "publish" && row.rowKind === "ledger_entry") { const owner = catalogs.accounts.find((item) => item.id === row.accountId); if (!owner) throw new Error("Actualiza el catálogo de cuentas antes de publicar."); return { ...identity, kind: "post_ledger_draft", entryId: row.id, expectedVersion: row.version, expectedAccountVersion: owner.version }; }
      if (action === "reverse" && row.rowKind === "ledger_entry") return { ...identity, kind: "reverse_ledger_entry", reversalEntryId: id, entryId: row.id, reason, operationalDate: today(), valueDate: today(), expectedVersion: row.version };
      if (action === "deliver" && row.rowKind === "check") return { ...identity, kind: "record_check_delivery", deliveryEventId: id, checkId: row.id, recipientName, deliveredAt: new Date().toISOString(), ...(evidenceReference ? { evidenceReference } : {}), expectedVersion: row.version };
      if (action === "undo" && row.rowKind === "check") return { ...identity, kind: "undo_check_delivery", deliveryEventId: id, checkId: row.id, reason, expectedVersion: row.version };
      throw new Error("La acción no aplica a este registro."); }, `${action}:${rowId}`); } catch (cause) { setError(treasuryErrorMessage(cause, "No fue posible completar la acción.")); } };
  const exportReport = async () => {
    if (kind !== "reports") return;
    setLoading(true); setError(null);
    try {
      const reportKind = filters.report as keyof typeof reportTitles;
      const result = await query<TreasuryReportRow>({ kind: "treasury_report", report: reportKind, from: filters.from, to: filters.to, ...(account ? { accountId: account } : {}), page: 1, pageSize: 10_000 });
      const columns = result.items[0] ? Object.keys(result.items[0].values) : reportColumns[reportKind];
      const snapshot: TreasuryReportSnapshot = { title: reportTitles[reportKind], generatedAt: new Date().toISOString(), columns, rows: result.items.map((row) => row.values) };
      if (filters.format === "pdf") {
        const document = await renderTreasuryPdf(new JsPdfTreasuryReportRenderer(`tesoreria-${reportKind}`), snapshot);
        download(document.bytes, document.fileName, document.mediaType);
      } else {
        download(new TextEncoder().encode(renderTreasuryCsv(snapshot)), `tesoreria-${reportKind}.csv`, "text/csv;charset=utf-8");
      }
    } catch (cause) { setError(treasuryErrorMessage(cause, "No se pudo generar el reporte.")); }
    finally { setLoading(false); }
  };
  const writable = ["accounts", "beneficiaries", "checkbooks", "movements", "checks", "deposits"].includes(kind) && !(kind === "checks" && checkTab !== "issued");
  const writePermission = kind === "checks" ? "treasury.checks" : kind === "movements" || kind === "deposits" ? "treasury.post" : "treasury.manage";
  const accountFilter = ["movements", "checks", "deposits", "checkbooks", "reports"].includes(kind); const dates = ["account", "movements", "deposits", "payments", "reports"].includes(kind);
  const statusOptions: readonly (readonly [string, string])[] = kind === "checks" ? [["issued", "Emitido"], ["delivered", "Entregado"], ["voided", "Anulado"], ["cleared", "Cobrado"]]
    : kind === "beneficiaries" ? [["active", "Activo"], ["inactive", "Inactivo"]]
    : kind === "movements" || kind === "account" ? [["draft", "Borrador"], ["posted", "Publicado"], ["reversed", "Reversado"]]
    : [];
  const statusFilter = statusOptions.length > 0 && !(kind === "checks" && checkTab !== "issued");
  return <main className="space-y-6 p-4 sm:p-6"><PageHeader title={spec.title} primaryAction={kind === "payments" ? <Link href="/settings/payment-orders" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">Administrar órdenes</Link> : writable && can(writePermission) ? <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">Nuevo</button> : undefined} />
    {kind === "account" && selected && <section className="grid gap-4 rounded-xl border border-default-200 bg-content1 p-5 sm:grid-cols-3"><div><p className="text-sm text-default-500">{selected.rowKind === "cash_box" ? "Caja" : "Cuenta bancaria"}</p><h2 className="mt-1 font-semibold">{label(selected)}</h2><p className="text-sm text-default-500">Estado: {selected.status}</p>{selected.rowKind === "bank_account" && <p className="text-sm text-default-500">{selected.accountNumberMasked}</p>}</div><div><p className="text-sm text-default-500">Saldo al {filters.to}</p><p className="mt-1 text-xl font-semibold">{accountBalance?.balance ?? "—"} {selected.currency}</p></div><div><p className="font-medium">Chequeras</p>{catalogs.checkbooks.filter((item) => item.bankAccountId === selected.id).map((item) => <p key={item.id} className="text-sm text-default-500">{item.firstNumber}–{item.lastNumber} · próximo {item.nextNumber}</p>)}<Link href={`/treasury/movements?account=${encodeURIComponent(selected.id)}&from=${encodeURIComponent(filters.from)}&to=${encodeURIComponent(filters.to)}`} className="mt-2 inline-block text-sm text-primary underline">Ver movimientos</Link></div></section>}
    {kind === "checks" && <div role="tablist" aria-label="Vistas de cheques" className="flex flex-wrap gap-2">{checkTabs.map(([tab, text]) => <button key={tab} type="button" role="tab" aria-selected={checkTab === tab} onClick={() => { setOpen(false); setFilters({ tab, status: "" }); }} className={`rounded-lg border px-3 py-2 text-sm ${checkTab === tab ? "border-primary bg-primary-50 text-primary" : "border-default-300"}`}>{text}</button>)}</div>}
    <section className="rounded-xl border border-default-200 bg-content1 p-5"><p className="text-sm text-default-500">{spec.description}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{accountFilter && <Select label="Cuenta" value={account} onChange={(v) => setFilters({ account: v })} options={catalogs.accounts.filter((a) => kind !== "checks" && kind !== "deposits" && kind !== "checkbooks" || a.rowKind === "bank_account").map((a) => [a.id, label(a)])} optional />}{dates && <><Input label="Desde" type="date" value={filters.from} onChange={(v) => setFilters({ from: v })}/><Input label="Hasta" type="date" value={filters.to} onChange={(v) => setFilters({ to: v })}/></>}{kind === "reports" && <><Select label="Reporte" value={filters.report} onChange={(v) => setFilters({ report: v })} options={Object.entries(reportTitles).map(([id, name]) => [id, name])}/><Select label="Formato" value={filters.format} onChange={(v) => setFilters({ format: v })} options={[["csv", "CSV"], ["pdf", "PDF"]]}/></>}{statusFilter && <Select label="Estado" value={filters.status} onChange={(v) => setFilters({ status: v })} optional options={statusOptions} />}{kind === "reports" && <button type="button" disabled={loading} onClick={() => void exportReport()} className="self-end rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">{loading ? "Generando…" : "Exportar"}</button>}</div></section>
    {kind === "payments" && <PaymentOrderExecution from={filters.from} to={filters.to} canPay={can("treasury.post")} />}
    {kind === "checks" && checkTab === "pending" && <CheckDeliveryBatch bankAccountId={account} canDeliver={can("treasury.checks")} />}
    {open && kind === "deposits" && <DepositForm onClose={() => setOpen(false)} />}
    {open && kind !== "deposits" && <section className="rounded-xl border border-primary-200 bg-content1 p-5"><h2 className="font-semibold">Nueva operación</h2><form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Fields kind={kind} form={form} put={put} catalogs={catalogs}/><button disabled={command.pending} className="rounded-lg bg-primary px-3 py-2 text-sm text-white">{command.pending ? "Guardando…" : "Guardar"}</button><button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button></form></section>}
    {error && <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger">{error}</p>}
    {tableVisible && !(kind === "checks" && checkTab === "pending") && <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="flex justify-between border-b p-4"><h2 className="font-semibold">Resultados</h2><span>{total} registros</span></div>{loading ? <p className="p-6">Cargando…</p> : rows.length ? <Table rows={rows} actions={kind === "movements" ? { publish: can("treasury.post"), reverse: can("treasury.reverse") } : kind === "checks" && checkTab === "issued" ? { deliver: can("treasury.checks"), undo: can("treasury.checks") } : undefined} onAction={runRowAction}/> : <p className="p-6 text-sm text-default-500">{spec.empty}</p>}<div className="flex justify-between border-t p-4"><button disabled={page === 1} onClick={() => setFilters({ page: String(page - 1) })}>Anterior</button><span>Página {page}</span><button disabled={page * 50 >= total} onClick={() => setFilters({ page: String(page + 1) })}>Siguiente</button></div></section>}</main>;
}

function Fields({ kind, form, put, catalogs }: { kind: Kind; form: Record<string, string>; put: (k: string, v: string) => void; catalogs: ReturnType<typeof useTreasuryCatalogs> }) { const input = (k: string, l: string, t?: string) => <Input label={l} value={form[k] ?? ""} onChange={(v) => put(k, v)} type={t}/>; if (kind === "accounts") return <>{<Select label="Tipo" value={form.type ?? ""} onChange={(v) => put("type", v)} options={[["cash", "Caja"], ["bank", "Banco"], ["account", "Cuenta bancaria"]]}/>} {input("code", "Código")}{input("name", "Nombre o titular")}{input("currency", "Moneda")}{form.type === "bank" && input("countryCode", "País")}{form.type === "account" && <>{<Select label="Banco" value={form.bankId ?? ""} onChange={(v) => put("bankId", v)} options={catalogs.banks.map((b) => [b.id, b.name])}/>} {input("accountNumber", "Número de cuenta")}</>}</>; if (kind === "beneficiaries") return <>{input("name", "Nombre legal")}{input("tax", "RIF", "text")}</>; if (kind === "checkbooks") return <>{<Select label="Cuenta" value={form.bankAccountId ?? ""} onChange={(v) => put("bankAccountId", v)} options={catalogs.accounts.filter((a) => a.rowKind === "bank_account").map((a) => [a.id, label(a)])}/>} {input("first", "Primer folio", "number")}{input("last", "Último folio", "number")}</>; if (kind === "movements") return <>{input("amount", "Monto", "number")}{input("concept", "Concepto")}{input("date", "Fecha", "date")}{<Select label="Dirección" value={form.direction ?? "credit"} onChange={(v) => put("direction", v)} options={[["credit", "Crédito"], ["debit", "Débito"]]}/>} {<Select label="Tipo" value={form.movementType ?? "bank_movement"} onChange={(v) => put("movementType", v)} options={[["cash_movement", "Movimiento caja"], ["cash_income", "Ingreso caja"], ["cash_expense", "Egreso caja"], ["bank_movement", "Movimiento banco"], ["bank_debit", "Débito banco"], ["bank_credit", "Crédito banco"]]}/>}</>; return <>{<Select label="Chequera" value={form.checkbookId ?? ""} onChange={(v) => put("checkbookId", v)} options={catalogs.checkbooks.filter((c) => c.status === "active").map((c) => [c.id, `${c.firstNumber}-${c.lastNumber} · próximo ${c.nextNumber}`])}/>} {<Select label="Beneficiario" value={form.beneficiaryId ?? ""} onChange={(v) => put("beneficiaryId", v)} options={catalogs.beneficiaries.filter((b) => b.status === "active").map((b) => [b.id, b.legalName])}/>} {input("amount", "Monto", "number")}{input("concept", "Concepto")}{input("date", "Fecha", "date")}</>; }
function Table({ rows, actions, onAction }: { rows: readonly TreasuryReadRow[]; actions?: Partial<Record<RowAction, boolean>>; onAction?: (row: TreasuryReadRow, action: RowAction) => void }) { const columns = Object.keys(rows[0]).filter((k) => k !== "rowKind" && k !== "version").slice(0, 6); return <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr>{columns.map((c) => <th key={c} className="px-4 py-3 text-left">{c}</th>)}{actions && <th className="px-4 py-3 text-left">Acciones</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={("id" in row ? row.id : "paymentId" in row ? row.paymentId : index)} className="border-t">{columns.map((c) => <td key={c} className="max-w-64 px-4 py-3">{String((row as unknown as Record<string, unknown>)[c] ?? "—")}</td>)}{actions && <td className="space-x-2 px-4 py-3">{row.rowKind === "ledger_entry" && row.status === "draft" && actions.publish && <button type="button" onClick={() => onAction?.(row, "publish")}>Publicar</button>}{row.rowKind === "ledger_entry" && row.status === "posted" && actions.reverse && <button type="button" onClick={() => onAction?.(row, "reverse")}>Reversar</button>}{row.rowKind === "check" && row.status === "issued" && actions.deliver && <button type="button" onClick={() => onAction?.(row, "deliver")}>Entregar</button>}{row.rowKind === "check" && row.status === "delivered" && actions.undo && <button type="button" onClick={() => onAction?.(row, "undo")}>Anular entrega</button>}</td>}</tr>)}</tbody></table></div>; }
