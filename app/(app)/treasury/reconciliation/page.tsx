"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";

type BankAccount = { rowKind: "bank_account"; id: string; currency: string; holderName: string; status: string };
type ReconciliationItem = {
  rowKind: "reconciliation_pending" | "reconciliation";
  id: string;
  state: "reconciled" | "statement_pending" | "ledger_pending" | "ambiguous";
  itemKind?: "statement_line" | "ledger_entry";
  amount?: string;
  currency?: string;
  direction?: "credit" | "debit";
  version?: number;
  valueDate?: string;
  reference?: string;
  ageDays?: number;
  reason: string;
  matchType?: "manual" | "automatic" | null;
  createdAt?: string;
  createdBy?: string;
};
type ReconciliationHistory = {
  rowKind: "reconciliation_history";
  id: string;
  statementLineId: string;
  ledgerEntryId: string;
  matchType: "manual" | "automatic";
  status: "active" | "undone";
  reason: string;
  createdAt: string;
  createdBy: string;
  version: number;
  undoneAt: string | null;
  undoReason: string | null;
};
type ReconciliationRule = { rowKind: "reconciliation_rule"; id: string; bankAccountId: string; activeFrom: string; dateWindowDays: number; toleranceAmount: string; currency: string; referenceWeight: string; dateWeight: string; version: number; active: boolean };
type ReconciliationStatement = { rowKind: "reconciliation_statement"; id: string; bankAccountId: string; periodStart: string; periodEnd: string; externalReference: string; status: "open" | "closed"; version: number; closedAt: string | null; differenceExplanation: string | null };
type PageData<T> = { items: T[]; page: number; pageSize: number; total: number };
type ReconciliationPreview = { id: string; ruleSetId: string; ruleVersion: number; asOf: string; results: Array<{ statementLineId: string; state: "matched" | "ambiguous" | "unmatched"; ledgerEntryId?: string; candidateLedgerEntryIds?: string[]; score?: number; reason?: string }> };
type CsvLine = { lineNumber: number; lineId: string; externalId: string; valueDate: string; direction: "credit" | "debit"; amount: string; currency: string; reference: string; description: string; errors: string[] };

const reconciliationStates = ["statement_pending", "ledger_pending", "ambiguous", "reconciled"] as const;
const stateLabels: Record<(typeof reconciliationStates)[number], string> = {
  statement_pending: "Extracto pendiente",
  ledger_pending: "Libro pendiente",
  ambiguous: "Coincidencia ambigua",
  reconciled: "Conciliado",
};
const csvHeaders = ["externalId", "valueDate", "direction", "amount", "currency", "reference", "description"];

/** Parses a neutral CSV document while preserving quoted commas and line breaks. */
function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += character;
  }
  if (quoted) throw new Error("El CSV contiene una comilla sin cerrar.");
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

/** Shows statement-import preview and company-scoped reconciliation facts.
 * @returns A Treasury reconciliation workspace with row-level CSV validation.
 * @throws Displays transport, authorization, and persistence errors inline.
 */
export default function TreasuryReconciliationPage(): React.JSX.Element {
  const { companyId } = useCompany();
  const { organization } = useOrganization();
  const { can } = useOrganizationModuleAccess("/treasury");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [statementCandidates, setStatementCandidates] = useState<ReconciliationItem[]>([]);
  const [ledgerCandidates, setLedgerCandidates] = useState<ReconciliationItem[]>([]);
  const [statementCandidatePage, setStatementCandidatePage] = useState(1);
  const [statementCandidateTotal, setStatementCandidateTotal] = useState(0);
  const [ledgerCandidatePage, setLedgerCandidatePage] = useState(1);
  const [ledgerCandidateTotal, setLedgerCandidateTotal] = useState(0);
  const [history, setHistory] = useState<ReconciliationHistory[]>([]);
  const [rules, setRules] = useState<ReconciliationRule[]>([]);
  const [statements, setStatements] = useState<ReconciliationStatement[]>([]);
  const [statementsTotal, setStatementsTotal] = useState(0);
  const [statementCatalogPage, setStatementCatalogPage] = useState(1);
  const [selectedStatementId, setSelectedStatementId] = useState("");
  const [closeExplanation, setCloseExplanation] = useState("");
  const [closingStatement, setClosingStatement] = useState(false);
  const [ruleCatalogPage, setRuleCatalogPage] = useState(1);
  const [ruleCatalogTotal, setRuleCatalogTotal] = useState(0);
  const [state, setState] = useState<(typeof reconciliationStates)[number]>("statement_pending");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [manualStatementId, setManualStatementId] = useState("");
  const [manualLedgerId, setManualLedgerId] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [undoReasons, setUndoReasons] = useState<Record<string, string>>({});
  const [undoingMatchId, setUndoingMatchId] = useState<string | null>(null);
  const [ruleActiveFrom, setRuleActiveFrom] = useState("");
  const [ruleDateWindow, setRuleDateWindow] = useState("3");
  const [ruleTolerance, setRuleTolerance] = useState("0.00");
  const [ruleReferenceWeight, setRuleReferenceWeight] = useState("100");
  const [ruleDateWeight, setRuleDateWeight] = useState("1");
  const [ruleId, setRuleId] = useState("");
  const [ruleVersion, setRuleVersion] = useState(0);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [previewAsOf, setPreviewAsOf] = useState("");
  const [automaticPreview, setAutomaticPreview] = useState<ReconciliationPreview | null>(null);
  const [previewingRule, setPreviewingRule] = useState(false);
  const [ruleActivated, setRuleActivated] = useState(false);
  const [ruleActivating, setRuleActivating] = useState(false);
  const [automaticRunning, setAutomaticRunning] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [csvLines, setCsvLines] = useState<CsvLine[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [statementId, setStatementId] = useState(() => crypto.randomUUID());
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId || !organization) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const prefix = `/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/query`;
      const query = async <T,>(kind: string, extra: Record<string, unknown> = {}): Promise<PageData<T>> => {
        const response = await fetch(prefix, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store", body: JSON.stringify({ kind, page: 1, pageSize: 100, ...extra }) });
        const payload = await response.json() as { data?: PageData<T>; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "No se pudo consultar la conciliación.");
        return payload.data;
      };
      const accountPage = await query<BankAccount>("list_bank_accounts", { pageSize: 500, status: "active" });
      setAccounts(accountPage.items);
      const selectedAccountId = accountPage.items.some((account) => account.id === accountId) ? accountId : accountPage.items[0]?.id ?? "";
      if (selectedAccountId !== accountId) setAccountId(selectedAccountId);
      if (!selectedAccountId) { setItems([]); setHistory([]); setRules([]); setRuleCatalogTotal(0); setStatements([]); setStatementsTotal(0); setStatementCandidates([]); setLedgerCandidates([]); setTotal(0); setHistoryTotal(0); return; }
      const [itemPage, historyResult, statementPage, ledgerPage, ruleResult, statementResult] = await Promise.all([
        query<ReconciliationItem>("list_reconciliation_items", { bankAccountId: selectedAccountId, state, page, pageSize: 50 }),
        query<ReconciliationHistory>("list_reconciliation_history", { bankAccountId: selectedAccountId, page: historyPage, pageSize: 50 }),
        query<ReconciliationItem>("list_reconciliation_items", { bankAccountId: selectedAccountId, state: "statement_pending", page: statementCandidatePage, pageSize: 500 }),
        query<ReconciliationItem>("list_reconciliation_items", { bankAccountId: selectedAccountId, state: "ledger_pending", page: ledgerCandidatePage, pageSize: 500 }),
        query<ReconciliationRule>("list_reconciliation_rules", { bankAccountId: selectedAccountId, page: ruleCatalogPage, pageSize: 100 }),
        query<ReconciliationStatement>("list_reconciliation_statements", { bankAccountId: selectedAccountId, status: "open", page: statementCatalogPage, pageSize: 100 }),
      ]);
      setItems(itemPage.items);
      setStatementCandidates(statementPage.items);
      setLedgerCandidates(ledgerPage.items);
      setRules(ruleResult.items);
      setRuleCatalogTotal(ruleResult.total);
      setStatements(statementResult.items);
      setStatementsTotal(statementResult.total);
      setStatementCandidateTotal(statementPage.total);
      setLedgerCandidateTotal(ledgerPage.total);
      setTotal(itemPage.total);
      setHistory(historyResult.items);
      setHistoryTotal(historyResult.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la conciliación.");
    } finally {
      setLoading(false);
    }
  }, [accountId, companyId, historyPage, ledgerCandidatePage, organization, page, ruleCatalogPage, state, statementCandidatePage, statementCatalogPage]);

  useEffect(() => { void load(); }, [load]);

  const csvPreview = useMemo(() => csvLines, [csvLines]);
  const validLines = useMemo(() => csvPreview.filter((line) => line.errors.length === 0), [csvPreview]);
  const invalidLineCount = csvPreview.length - validLines.length;
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const selectedRule = rules.find((rule) => rule.id === ruleId && rule.version === ruleVersion);
  const selectedStatement = statements.find((statement) => statement.id === selectedStatementId);
  const selectedStatementLine = statementCandidates.find((item) => item.id === manualStatementId && item.itemKind === "statement_line");
  const manualLedgerOptions = useMemo(() => ledgerCandidates.filter((item) => item.itemKind === "ledger_entry" && item.amount === selectedStatementLine?.amount && item.currency === selectedStatementLine?.currency && item.direction === selectedStatementLine?.direction), [ledgerCandidates, selectedStatementLine]);
  const selectedLedger = manualLedgerOptions.find((item) => item.id === manualLedgerId);

  useEffect(() => {
    if (!manualLedgerOptions.some((item) => item.id === manualLedgerId)) setManualLedgerId("");
  }, [manualLedgerId, manualLedgerOptions]);

  useEffect(() => {
    setCsvLines((current) => current.map((line) => {
      const errors = line.errors.filter((message) => !message.startsWith("La moneda no coincide con") && message !== "La fecha está fuera del período del extracto.");
      if (periodStart && line.valueDate < periodStart || periodEnd && line.valueDate > periodEnd) errors.push("La fecha está fuera del período del extracto.");
      if (selectedAccount && line.currency !== selectedAccount.currency) errors.push(`La moneda no coincide con ${selectedAccount.currency}.`);
      return { ...line, errors };
    }));
  }, [periodEnd, periodStart, selectedAccount]);

  const readCsv = async (file: File | undefined) => {
    setCsvError(null);
    setNotice(null);
    setCsvLines([]);
    if (!file) return;
    if (file.size > 2_000_000) { setCsvError("El archivo supera el límite de 2 MB."); return; }
    try {
      const rows = parseCsv(await file.text());
      const header = rows.shift()?.map((value) => value.trim());
      if (!header || header.length !== csvHeaders.length || csvHeaders.some((value, index) => header[index] !== value)) {
        throw new Error(`El encabezado debe ser: ${csvHeaders.join(",")}.`);
      }
      if (rows.length > 1000) throw new Error("El archivo supera el máximo de 1.000 movimientos.");
      const externalIds = new Set<string>();
      const lines = rows.map((values, index): CsvLine => {
        const errors: string[] = [];
        if (values.length !== csvHeaders.length) errors.push("Cantidad de columnas incorrecta.");
        const [externalId = "", valueDate = "", rawDirection = "", amount = "", currency = "", reference = "", description = ""] = values.map((value) => value.trim());
        if (!externalId) errors.push("Falta el identificador externo.");
        if (externalIds.has(externalId)) errors.push("El identificador externo está duplicado.");
        externalIds.add(externalId);
        const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(valueDate) ? new Date(`${valueDate}T00:00:00Z`) : null;
        if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== valueDate) errors.push("La fecha debe tener formato AAAA-MM-DD y ser válida.");
        if (rawDirection !== "credit" && rawDirection !== "debit") errors.push("La dirección debe ser credit o debit.");
        if (!/^(?:0|[1-9]\d{0,19})(?:\.\d{1,8})?$/.test(amount) || Number(amount) <= 0) errors.push("El importe debe ser positivo y tener hasta 8 decimales.");
        if (!/^[A-Z]{3}$/.test(currency)) errors.push("La moneda debe usar 3 letras mayúsculas.");
        if (!reference) errors.push("Falta la referencia bancaria.");
        if (!description) errors.push("Falta la descripción.");
        return { lineNumber: index + 2, lineId: crypto.randomUUID(), externalId, valueDate, direction: rawDirection as "credit" | "debit", amount, currency, reference, description, errors };
      });
      setCsvLines(lines);
      if (!externalReference) setExternalReference(file.name);
    } catch (cause) {
      setCsvError(cause instanceof Error ? cause.message : "No se pudo leer el CSV.");
    }
  };

  const importStatement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !selectedAccount || !can("treasury.reconcile") || validLines.length === 0 || invalidLineCount > 0) return;
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({
          kind: "import_bank_statement", statementId, bankAccountId: accountId, periodStart, periodEnd, externalReference: externalReference.trim(),
          lines: validLines.map((line) => ({ lineId: line.lineId, externalId: line.externalId, valueDate: line.valueDate, direction: line.direction, money: { amount: line.amount, currency: line.currency }, reference: line.reference, description: line.description })),
          idempotencyKey, correlationId: idempotencyKey,
        }),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo importar el extracto.");
      setNotice("Extracto importado. Puedes revisar sus líneas pendientes y continuar con la conciliación.");
      setCsvLines([]);
      setStatementId(crypto.randomUUID());
      setIdempotencyKey(crypto.randomUUID());
      setState("statement_pending");
      setPage(1);
      setStatementCatalogPage(1);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo importar el extracto.");
    } finally {
      setImporting(false);
    }
  };

  const reconcileManually = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !selectedAccount || !selectedStatementLine?.version || !selectedLedger?.version || !manualReason.trim() || !can("treasury.reconcile")) return;
    setReconciling(true);
    setError(null);
    setNotice(null);
    const matchId = crypto.randomUUID();
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({ kind: "reconcile_manually", matchId, bankAccountId: accountId, statementLineId: selectedStatementLine.id, ledgerEntryId: selectedLedger.id, expectedStatementLineVersion: selectedStatementLine.version, expectedLedgerEntryVersion: selectedLedger.version, reason: manualReason.trim(), idempotencyKey: matchId, correlationId: matchId }),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo conciliar las partidas seleccionadas.");
      setNotice("Partidas conciliadas manualmente.");
      setManualStatementId("");
      setManualLedgerId("");
      setManualReason("");
      setState("reconciled");
      setPage(1);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo conciliar las partidas seleccionadas.");
    } finally {
      setReconciling(false);
    }
  };

  const configureRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !selectedAccount || !can("treasury.manage")) return;
    setRuleSaving(true); setError(null); setNotice(null);
    const newRuleId = crypto.randomUUID(); const idempotencyKey = crypto.randomUUID();
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store", body: JSON.stringify({ kind: "configure_reconciliation", ruleSetId: newRuleId, bankAccountId: accountId, expectedVersion: 0, activeFrom: ruleActiveFrom, dateWindowDays: Number(ruleDateWindow), amountTolerance: { amount: ruleTolerance, currency: selectedAccount.currency }, referenceWeight: Number(ruleReferenceWeight), dateWeight: Number(ruleDateWeight), idempotencyKey, correlationId: idempotencyKey }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo guardar la regla.");
      const newRule: ReconciliationRule = { rowKind: "reconciliation_rule", id: newRuleId, bankAccountId: accountId, activeFrom: ruleActiveFrom, dateWindowDays: Number(ruleDateWindow), toleranceAmount: ruleTolerance, currency: selectedAccount.currency, referenceWeight: ruleReferenceWeight, dateWeight: ruleDateWeight, version: 1, active: false };
      setRules((current) => [newRule, ...current]); setRuleCatalogTotal((current) => current + 1); setRuleId(newRuleId); setRuleVersion(1); setAutomaticPreview(null); setRuleActivated(false);
      setNotice("Regla guardada como borrador. Genera una vista previa antes de activarla.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la regla."); }
    finally { setRuleSaving(false); }
  };

  const previewRule = async () => {
    if (!companyId || !organization || !selectedRule || selectedRule.active || !previewAsOf || !can("treasury.reconcile")) return;
    setPreviewingRule(true); setError(null); setNotice(null);
    const previewId = crypto.randomUUID(); const idempotencyKey = crypto.randomUUID();
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const prefix = `/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury`;
      const response = await fetch(`${prefix}/commands`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store", body: JSON.stringify({ kind: "preview_reconciliation_rule", previewId, ruleSetId: ruleId, ruleVersion, bankAccountId: accountId, asOf: previewAsOf, idempotencyKey, correlationId: idempotencyKey }) });
      const commandPayload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(commandPayload.error?.message ?? "No se pudo evaluar la regla.");
      const queryResponse = await fetch(`${prefix}/query`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store", body: JSON.stringify({ kind: "get_reconciliation_preview", previewId, page: 1, pageSize: 1 }) });
      const queryPayload = await queryResponse.json() as { data?: PageData<ReconciliationPreview>; error?: { message?: string } };
      if (!queryResponse.ok || !queryPayload.data?.items[0]) throw new Error(queryPayload.error?.message ?? "No se pudo leer la vista previa guardada.");
      setAutomaticPreview(queryPayload.data.items[0]); setRuleActivated(false);
      setNotice("Vista previa generada. Los vínculos no se aplican hasta activar y ejecutar.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo evaluar la regla."); }
    finally { setPreviewingRule(false); }
  };

  const activateRule = async () => {
    if (!companyId || !organization || !automaticPreview || !can("treasury.manage")) return;
    setRuleActivating(true); setError(null); const idempotencyKey = crypto.randomUUID();
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store", body: JSON.stringify({ kind: "activate_reconciliation_rule", ruleSetId: automaticPreview.ruleSetId, ruleVersion: automaticPreview.ruleVersion, bankAccountId: accountId, previewId: automaticPreview.id, idempotencyKey, correlationId: idempotencyKey }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo activar la regla.");
      setRuleActivated(true); setNotice("Regla activada. Ejecuta la conciliación para aplicar coincidencias únicas.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo activar la regla."); }
    finally { setRuleActivating(false); }
  };

  const runAutomaticReconciliation = async () => {
    if (!companyId || !organization || !selectedRule || !previewAsOf || !(selectedRule.active || ruleActivated) || !can("treasury.reconcile")) return;
    setAutomaticRunning(true); setError(null); const runId = crypto.randomUUID();
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store", body: JSON.stringify({ kind: "run_automatic_reconciliation", runId, bankAccountId: accountId, ruleSetId: selectedRule.id, asOf: previewAsOf, idempotencyKey: runId, correlationId: runId }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo ejecutar la conciliación automática.");
      setNotice("Ejecución terminada. Coincidencias únicas conciliadas; ambigüedades permanecen pendientes."); setState("ambiguous"); setPage(1); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo ejecutar la conciliación automática."); }
    finally { setAutomaticRunning(false); }
  };

  const closeStatement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !selectedStatement || !can("treasury.reconcile")) return;
    setClosingStatement(true); setError(null); setNotice(null);
    const closeId = crypto.randomUUID();
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store", body: JSON.stringify({ kind: "close_reconciliation", closeId, bankAccountId: accountId, statementId: selectedStatement.id, expectedStatementVersion: selectedStatement.version, closedAt: new Date().toISOString(), differenceExplanation: closeExplanation.trim() || undefined, idempotencyKey: closeId, correlationId: closeId }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo cerrar el extracto.");
      setNotice("Conciliación cerrada. El extracto queda bloqueado para nuevos vínculos.");
      setSelectedStatementId(""); setCloseExplanation(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cerrar el extracto."); }
    finally { setClosingStatement(false); }
  };

  const undoMatch = async (match: ReconciliationHistory) => {
    if (!companyId || !organization || !can("treasury.reverse") || !undoReasons[match.id]?.trim()) return;
    setUndoingMatchId(match.id);
    setError(null);
    setNotice(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store", body: JSON.stringify({ kind: "undo_reconciliation_match", matchId: match.id, expectedVersion: match.version, reason: undoReasons[match.id].trim(), idempotencyKey, correlationId: idempotencyKey }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo deshacer el vínculo.");
      setNotice("Vínculo deshecho. El evento se conserva en el historial.");
      setUndoReasons((current) => ({ ...current, [match.id]: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo deshacer el vínculo.");
    } finally {
      setUndoingMatchId(null);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([`${csvHeaders.join(",")}\nEXT-001,2026-10-01,credit,125.50,VES,REF-001,Abono bancario\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "extracto-tesoreria.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <main className="min-h-full space-y-6 p-6">
    <PageHeader title="Conciliación bancaria" subtitle="Importa extractos, revisa diferencias y conserva el historial de vínculos." />
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default-200 bg-content1 p-4"><div><p className="text-sm text-default-500">Empresa activa</p><p className="font-medium">{companyId ?? "Selecciona una empresa"}</p></div><button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-default-300 px-3 py-2 text-sm disabled:opacity-50">{loading ? "Actualizando..." : "Actualizar"}</button></div>
    {error && <div role="alert" className="rounded-lg border border-danger-300 bg-danger-50 p-4 text-sm text-danger-700">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-success-300 bg-success-50 p-4 text-sm text-success-700">{notice}</div>}
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-default-200 p-5"><div><h2 className="font-semibold">Importar extracto CSV</h2><p className="text-sm text-default-500">Formato neutral, hasta 1.000 filas y 2 MB. La vista previa marca errores antes de enviar.</p></div><button type="button" onClick={downloadTemplate} className="rounded-lg border border-default-300 px-3 py-2 text-sm">Descargar plantilla</button></div>
      <form onSubmit={importStatement} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">Cuenta bancaria<select required value={accountId} onChange={(event) => { setAccountId(event.target.value); setStatementCandidatePage(1); setLedgerCandidatePage(1); setManualStatementId(""); setManualLedgerId(""); setRuleId(""); setRuleVersion(0); setRuleCatalogPage(1); setStatementCatalogPage(1); setSelectedStatementId(""); setCloseExplanation(""); setPreviewAsOf(""); setAutomaticPreview(null); setRuleActivated(false); setCsvLines((current) => current.map((line) => ({ ...line, errors: line.errors.filter((message) => !message.startsWith("La moneda no coincide con")) }))); }} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{accounts.filter((account) => account.status === "active").map((account) => <option key={account.id} value={account.id}>{account.holderName} · {account.currency}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Inicio del período<input required type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Fin del período<input required type="date" min={periodStart || undefined} value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Referencia externa<input required maxLength={160} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Archivo CSV<input required type="file" accept=".csv,text/csv" onChange={(event) => void readCsv(event.target.files?.[0])} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <div className="flex items-end"><button type="submit" disabled={!can("treasury.reconcile") || importing || loading || !selectedAccount || !periodStart || !periodEnd || periodStart > periodEnd || !externalReference.trim() || !csvPreview.length || invalidLineCount > 0} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{importing ? "Importando..." : "Importar extracto"}</button></div>
        {!can("treasury.reconcile") && <p className="text-sm text-warning-700 sm:col-span-4">Necesitas el permiso de conciliación para importar extractos.</p>}
      </form>
      {csvError && <p role="alert" className="border-t border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{csvError}</p>}
      {csvPreview.length > 0 && <div className="space-y-3 border-t border-default-200 p-4"><p className="text-sm">Vista previa: {csvPreview.length} filas · {validLines.length} válidas · {invalidLineCount} con errores.</p><div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-default-100"><tr><th className="p-2">Fila</th><th className="p-2">ID externo</th><th className="p-2">Fecha</th><th className="p-2">Dirección</th><th className="p-2">Importe</th><th className="p-2">Referencia</th><th className="p-2">Validación</th></tr></thead><tbody>{csvPreview.map((line) => <tr key={line.lineId} className="border-t border-default-100"><td className="p-2">{line.lineNumber}</td><td className="p-2">{line.externalId || "--"}</td><td className="p-2">{line.valueDate || "--"}</td><td className="p-2">{line.direction || "--"}</td><td className="p-2">{line.amount} {line.currency}</td><td className="p-2">{line.reference || "--"}</td><td className="p-2 text-danger-700">{line.errors.join(" ") || "Correcta"}</td></tr>)}</tbody></table></div></div>}
    </section>
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="border-b border-default-200 p-5"><h2 className="font-semibold">Conciliar manualmente</h2><p className="text-sm text-default-500">Solo se ofrecen partidas con importe, moneda y dirección iguales. El servidor vuelve a comprobar ambas versiones y la cuenta.</p></div><form onSubmit={reconcileManually} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1 text-sm">Línea del extracto<select required value={manualStatementId} onChange={(event) => { setManualStatementId(event.target.value); setManualLedgerId(""); }} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{statementCandidates.map((item) => <option key={item.id} value={item.id}>{item.valueDate} · {item.reference} · {item.amount} {item.currency} · {item.direction}</option>)}</select><span className="flex items-center gap-2 text-xs text-default-500"><button type="button" disabled={statementCandidatePage <= 1 || loading} onClick={() => { setStatementCandidatePage((current) => current - 1); setManualStatementId(""); setManualLedgerId(""); }} className="rounded border border-default-300 px-2 py-1 disabled:opacity-50">Anterior</button>{statementCandidatePage} / {Math.max(1, Math.ceil(statementCandidateTotal / 500))}<button type="button" disabled={statementCandidatePage * 500 >= statementCandidateTotal || loading} onClick={() => { setStatementCandidatePage((current) => current + 1); setManualStatementId(""); setManualLedgerId(""); }} className="rounded border border-default-300 px-2 py-1 disabled:opacity-50">Siguiente</button><span>{statementCandidateTotal} líneas</span></span></label><label className="grid gap-1 text-sm">Movimiento de Tesorería<select required value={manualLedgerId} onChange={(event) => setManualLedgerId(event.target.value)} disabled={!selectedStatementLine} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{manualLedgerOptions.map((item) => <option key={item.id} value={item.id}>{item.valueDate} · {item.reference} · {item.amount} {item.currency} · {item.direction}</option>)}</select><span className="flex items-center gap-2 text-xs text-default-500"><button type="button" disabled={ledgerCandidatePage <= 1 || loading} onClick={() => { setLedgerCandidatePage((current) => current - 1); setManualLedgerId(""); }} className="rounded border border-default-300 px-2 py-1 disabled:opacity-50">Anterior</button>{ledgerCandidatePage} / {Math.max(1, Math.ceil(ledgerCandidateTotal / 500))}<button type="button" disabled={ledgerCandidatePage * 500 >= ledgerCandidateTotal || loading} onClick={() => { setLedgerCandidatePage((current) => current + 1); setManualLedgerId(""); }} className="rounded border border-default-300 px-2 py-1 disabled:opacity-50">Siguiente</button><span>{ledgerCandidateTotal} movimientos</span></span></label><label className="grid gap-1 text-sm lg:col-span-2">Motivo<input required maxLength={500} value={manualReason} onChange={(event) => setManualReason(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><div className="flex items-end"><button type="submit" disabled={!can("treasury.reconcile") || reconciling || loading || !selectedStatementLine || !selectedLedger || !manualReason.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{reconciling ? "Conciliando..." : "Conciliar seleccionados"}</button></div>{manualStatementId && manualLedgerOptions.length === 0 && <p className="text-sm text-warning-700 sm:col-span-4">No hay movimientos pendientes que coincidan en importe, moneda y dirección.</p>}{!can("treasury.reconcile") && <p className="text-sm text-warning-700 sm:col-span-4">Necesitas el permiso de conciliación para conciliar partidas.</p>}</form></section>
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1">
      <div className="border-b border-default-200 p-5"><h2 className="font-semibold">Regla automatica</h2><p className="text-sm text-default-500">Guarda una version nueva, revisa su vista previa y activala explicitamente antes de ejecutar coincidencias.</p></div>
      <form onSubmit={configureRule} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">Activa desde<input required type="date" value={ruleActiveFrom} onChange={(event) => setRuleActiveFrom(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Ventana de fechas (dias)<input required type="number" min="0" max="365" step="1" value={ruleDateWindow} onChange={(event) => setRuleDateWindow(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Tolerancia ({selectedAccount?.currency ?? "moneda"})<input required type="number" min="0" step="0.00000001" value={ruleTolerance} onChange={(event) => setRuleTolerance(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Peso de referencia<input required type="number" min="0" step="0.01" value={ruleReferenceWeight} onChange={(event) => setRuleReferenceWeight(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Peso de fecha<input required type="number" min="0" step="0.01" value={ruleDateWeight} onChange={(event) => setRuleDateWeight(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <div className="flex items-end"><button type="submit" disabled={!can("treasury.manage") || ruleSaving || loading || !selectedAccount || !ruleActiveFrom || Number(ruleReferenceWeight) + Number(ruleDateWeight) <= 0} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{ruleSaving ? "Guardando..." : "Guardar borrador"}</button></div>
      </form>
      <div className="grid gap-3 border-t border-default-200 p-4 sm:grid-cols-2"><label className="grid gap-1 text-sm">Versiones de reglas<select value={selectedRule ? `${selectedRule.id}|${selectedRule.version}` : ""} onChange={(event) => { const [id, rawVersion] = event.target.value.split("|"); const next = rules.find((item) => item.id === id && item.version === Number(rawVersion)); setRuleId(next?.id ?? ""); setRuleVersion(next?.version ?? 0); setRuleActivated(next?.active ?? false); setAutomaticPreview(null); }} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona una regla</option>{rules.map((item) => <option key={`${item.id}-${item.version}`} value={`${item.id}|${item.version}`}>{item.active ? "Activa" : "Borrador"} · v{item.version} · desde {item.activeFrom} · tol. {item.toleranceAmount} {item.currency}</option>)}</select></label><div className="flex items-end justify-between gap-2 text-sm"><span>{ruleCatalogTotal} versiones</span><div className="flex gap-2"><button type="button" disabled={ruleCatalogPage <= 1 || loading} onClick={() => setRuleCatalogPage((current) => current - 1)} className="rounded border border-default-300 px-3 py-2 disabled:opacity-50">Anterior</button><button type="button" disabled={ruleCatalogPage * 100 >= ruleCatalogTotal || loading} onClick={() => setRuleCatalogPage((current) => current + 1)} className="rounded border border-default-300 px-3 py-2 disabled:opacity-50">Siguiente</button></div></div></div>
      {selectedRule && <div className="grid gap-3 border-t border-default-200 p-4 sm:grid-cols-2 lg:grid-cols-4"><p className="self-end text-sm">{selectedRule.active || ruleActivated ? "Regla activa" : "Borrador"} · {selectedRule.id} · v{selectedRule.version}</p><label className="grid gap-1 text-sm">Evaluar hasta<input required type="date" value={previewAsOf} onChange={(event) => { setPreviewAsOf(event.target.value); setAutomaticPreview(null); setRuleActivated(false); }} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>{!selectedRule.active && <button type="button" onClick={() => void previewRule()} disabled={!can("treasury.reconcile") || previewingRule || !previewAsOf} className="self-end rounded-lg border border-default-300 px-4 py-2 text-sm disabled:opacity-50">{previewingRule ? "Evaluando..." : "Generar vista previa"}</button>}{automaticPreview && !selectedRule.active && <button type="button" onClick={() => void activateRule()} disabled={!can("treasury.manage") || ruleActivating || ruleActivated} className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{ruleActivating ? "Activando..." : ruleActivated ? "Regla activada" : "Activar regla"}</button>}{(selectedRule.active || ruleActivated) && <button type="button" onClick={() => void runAutomaticReconciliation()} disabled={!can("treasury.reconcile") || automaticRunning || !previewAsOf} className="self-end rounded-lg border border-default-300 px-4 py-2 text-sm disabled:opacity-50">{automaticRunning ? "Ejecutando..." : "Ejecutar conciliación"}</button>}</div>}
      {automaticPreview && <div className="space-y-3 border-t border-default-200 p-4"><p className="text-sm">Vista previa ? {automaticPreview.asOf} ? {automaticPreview.results.filter((item) => item.state === "matched").length} coincidencias unicas ? {automaticPreview.results.filter((item) => item.state === "ambiguous").length} ambiguas ? {automaticPreview.results.filter((item) => item.state === "unmatched").length} sin candidato.</p><ul className="max-h-72 space-y-1 overflow-auto text-sm">{automaticPreview.results.map((item) => <li key={item.statementLineId} className="rounded bg-default-100 p-2">{item.state === "matched" ? "Coincidencia" : item.state === "ambiguous" ? "Ambigua" : "Sin candidato"} ? linea {item.statementLineId}{item.ledgerEntryId ? ` ? movimiento ${item.ledgerEntryId}` : ""}{item.candidateLedgerEntryIds?.length ? ` ? ${item.candidateLedgerEntryIds.length} candidatos` : ""}</li>)}</ul></div>}
    </section>
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="border-b border-default-200 p-5"><h2 className="font-semibold">Cerrar conciliación</h2><p className="text-sm text-default-500">El cierre valida que todas las diferencias pendientes tengan una explicación y conserva la versión del extracto.</p></div><form onSubmit={closeStatement} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1 text-sm sm:col-span-2">Extracto abierto<select required value={selectedStatementId} onChange={(event) => setSelectedStatementId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{statements.map((statement) => <option key={statement.id} value={statement.id}>{statement.periodStart} a {statement.periodEnd} · {statement.externalReference} · v{statement.version}</option>)}</select><span className="flex items-center gap-2 text-xs text-default-500"><button type="button" disabled={statementCatalogPage <= 1 || loading} onClick={() => { setStatementCatalogPage((current) => current - 1); setSelectedStatementId(""); }} className="rounded border border-default-300 px-2 py-1 disabled:opacity-50">Anterior</button>{statementCatalogPage} / {Math.max(1, Math.ceil(statementsTotal / 100))}<button type="button" disabled={statementCatalogPage * 100 >= statementsTotal || loading} onClick={() => { setStatementCatalogPage((current) => current + 1); setSelectedStatementId(""); }} className="rounded border border-default-300 px-2 py-1 disabled:opacity-50">Siguiente</button><span>{statementsTotal} abiertos</span></span></label><label className="grid gap-1 text-sm sm:col-span-2">Explicación de diferencias (si aplica)<textarea maxLength={1000} value={closeExplanation} onChange={(event) => setCloseExplanation(event.target.value)} className="min-h-20 rounded-lg border border-default-300 bg-background px-3 py-2" /></label><div className="flex items-end"><button type="submit" disabled={!can("treasury.reconcile") || closingStatement || loading || !selectedStatement} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{closingStatement ? "Cerrando..." : "Cerrar extracto"}</button></div>{!can("treasury.reconcile") && <p className="text-sm text-warning-700 sm:col-span-4">Necesitas el permiso de conciliación para cerrar extractos.</p>}</form></section>
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-default-200 p-5"><div><h2 className="font-semibold">Partidas de conciliación</h2><p className="text-sm text-default-500">Pendientes, ambiguas y conciliadas para la cuenta seleccionada.</p></div><select aria-label="Estado de conciliación" value={state} onChange={(event) => { setState(event.target.value as (typeof reconciliationStates)[number]); setPage(1); }} className="rounded-lg border border-default-300 bg-background px-3 py-2">{reconciliationStates.map((item) => <option key={item} value={item}>{stateLabels[item]}</option>)}</select></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-default-100 text-default-600"><tr><th className="p-3">Estado</th><th className="p-3">Tipo</th><th className="p-3">Fecha</th><th className="p-3">Referencia</th><th className="p-3 text-right">Importe</th><th className="p-3">Detalle</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-default-100"><td className="p-3">{stateLabels[item.state]}</td><td className="p-3">{item.itemKind === "statement_line" ? "Extracto" : item.itemKind === "ledger_entry" ? "Libro" : item.matchType ?? "Vínculo"}</td><td className="p-3">{item.valueDate ?? item.createdAt ?? "--"}</td><td className="p-3">{item.reference ?? `${item.id}`}</td><td className="p-3 text-right">{item.amount ?? "--"} {item.currency ?? ""}</td><td className="p-3">{item.reason}</td></tr>)}{items.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-sm text-default-500">No hay partidas para este estado.</td></tr>}</tbody></table></div><div className="flex items-center justify-between gap-3 p-4 text-sm"><span>Página {page} · {total} partidas</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Anterior</button><button type="button" disabled={page * 50 >= total || loading} onClick={() => setPage((current) => current + 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Siguiente</button></div></div>
    </section>
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="border-b border-default-200 p-5"><h2 className="font-semibold">Historial de vínculos</h2><p className="text-sm text-default-500">Los deshacer se conservan como eventos compensatorios.</p></div><ul className="divide-y divide-default-100">{history.map((item) => <li key={item.id} className="grid gap-2 p-4 text-sm sm:grid-cols-2"><span className="font-medium">{item.matchType === "manual" ? "Manual" : "Automático"} · {item.status === "active" ? "Activo" : "Deshecho"}</span><span className="text-default-500">{item.createdAt} · {item.createdBy}</span><span>Línea {item.statementLineId} ↔ movimiento {item.ledgerEntryId}</span><span>{item.status === "undone" ? item.undoReason : item.reason}</span>{item.status === "active" && can("treasury.reverse") && <form className="flex flex-wrap items-center gap-2 sm:col-span-2" onSubmit={(event) => { event.preventDefault(); void undoMatch(item); }}><label className="flex min-w-64 flex-1 items-center gap-2">Motivo para deshacer<input required maxLength={500} value={undoReasons[item.id] ?? ""} onChange={(event) => setUndoReasons((current) => ({ ...current, [item.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-default-300 bg-background px-3 py-2" /></label><button type="submit" disabled={undoingMatchId === item.id || loading || !undoReasons[item.id]?.trim()} className="rounded-lg border border-default-300 px-3 py-2 disabled:opacity-50">{undoingMatchId === item.id ? "Deshaciendo..." : "Deshacer vínculo"}</button></form>}</li>)}{history.length === 0 && <li className="p-6 text-center text-sm text-default-500">No hay vínculos en el historial.</li>}</ul><div className="flex items-center justify-between gap-3 p-4 text-sm"><span>Página {historyPage} · {historyTotal} vínculos</span><div className="flex gap-2"><button type="button" disabled={historyPage <= 1 || loading} onClick={() => setHistoryPage((current) => current - 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Anterior</button><button type="button" disabled={historyPage * 50 >= historyTotal || loading} onClick={() => setHistoryPage((current) => current + 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Siguiente</button></div></div></section>
  </main>;
}
