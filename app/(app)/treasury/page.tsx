"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Landmark, RefreshCw, WalletCards } from "lucide-react";
import { addDecimal, exactDecimal } from "@kontave/monetary/domain";
import { renderTreasuryCsv, type TreasuryReportSnapshot } from "@kontave/treasury/application";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";

type Account = { rowKind: "bank_account" | "cash_box"; id: string; currency: string; holderName?: string; name?: string; accountNumberMasked?: string; code?: string; status: string; version: number };
type LedgerEntry = { id: string; direction: "credit" | "debit"; amount: string; currency: string; movementType: string; concept: string; operationalDate: string; status: string; sourceType: string | null; responsibleActorId: string | null; version: number };
type Check = { id: string; number: string; bankAccountId: string; amount: string; currency: string; issueDate: string; status: string; version: number };
type Balance = { rowKind: "balance"; accountId: string; currency: string; balance: string };
type Bank = { rowKind: "bank"; id: string; code: string; name: string; countryCode: string };
type Beneficiary = { rowKind: "beneficiary"; id: string; legalName: string; taxIdentifier: string | null; status: "active" | "inactive"; bankDetails: { id: string; bankId: string; currency: string; accountNumberMasked: string; accountHolder: string }[] };
type Checkbook = { rowKind: "checkbook"; id: string; bankAccountId: string; firstNumber: number; lastNumber: number; nextNumber: number; status: "active" | "closed"; version: number };
type CheckDelivery = { rowKind: "check_delivery"; id: string; checkId: string; eventType: string; recipientName: string | null; occurredAt: string; reason: string | null; evidenceReference: string | null };
type Deposit = { rowKind: "deposit"; id: string; destinationBankAccountId: string; amount: string; currency: string; depositDate: string; reference: string };
type EligibleCollection = { rowKind: "eligible_collection"; collectionId: string; receivableId: string; receivedAmount: string; reservedAmount: string; availableAmount: string; currency: string; receivedAt: string };
type PaymentOrder = { id: string; companyId: string; beneficiary: string; concept: string; amount: string; currency: string; dueDate: string | null; status: "draft" | "cancelled"; version: number };
type PaymentOrderSettlement = { settlementStatus: "unpaid" | "paid" | "cancelled"; execution: { paymentId: string; occurredOn: string; ledgerEntryId: string } | null; remainingAmount: string };
type PaymentOrderExecution = { rowKind: "payment_order_execution"; paymentId: string; paymentOrderId: string; amount: string; currency: string; occurredOn: string; ledgerEntryId: string };
type TreasuryReportRow = { rowKind: "report"; values: Readonly<Record<string, string | number | boolean | null>> };
type PageData<T> = { items: T[]; page: number; pageSize: number; total: number; asOf: string };
type TreasuryStatusSummary = { checks: Record<string, number>; ledger: Record<string, number> };
type TreasuryReportKind = "cash_ledger" | "bank_ledger" | "balances" | "checks" | "deposits" | "payments" | "reconciliation";
const REPORT_COLUMNS: Readonly<Record<TreasuryReportKind, readonly string[]>> = {
  cash_ledger: ["id", "accountId", "direction", "amount", "currency", "movementType", "operationalDate", "valueDate", "concept", "status", "sourceType", "sourceId"],
  bank_ledger: ["id", "accountId", "direction", "amount", "currency", "movementType", "operationalDate", "valueDate", "concept", "status", "sourceType", "sourceId"],
  balances: ["accountId", "accountKind", "currency", "balance", "asOfDate"],
  checks: ["id", "checkbookId", "bankAccountId", "number", "beneficiaryId", "amount", "currency", "issueDate", "status", "ledgerEntryId"],
  deposits: ["id", "destinationBankAccountId", "sourceAccountKind", "sourceAccountId", "amount", "currency", "depositDate", "reference", "sourceLedgerEntryId", "destinationLedgerEntryId"],
  payments: ["paymentId", "paymentOrderId", "beneficiaryId", "accountKind", "accountId", "amount", "currency", "method", "valueDate", "ledgerEntryId"],
  reconciliation: ["matchId", "bankAccountId", "statementLineId", "ledgerEntryId", "matchType", "ruleSetId", "ruleVersion", "reason", "statementAmount", "statementCurrency", "statementDate", "statementReference", "ledgerAmount", "ledgerCurrency", "ledgerDate", "ledgerReference"],
};

/** Shows the authenticated company's treasury accounts and recent activity.
 * @returns A company-scoped Treasury dashboard backed by the reusable application package.
 * @throws Displays an inline error when session, authorization, or persistence is unavailable.
 */
export default function TreasuryPage(): React.JSX.Element {
  const { companyId } = useCompany();
  const { organization } = useOrganization();
  const { can } = useOrganizationModuleAccess("/treasury");
  const { can: canReadPaymentOrders } = useOrganizationModuleAccess("/settings/payment-orders");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [entriesPage, setEntriesPage] = useState(1);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [checks, setChecks] = useState<Check[]>([]);
  const [checksPage, setChecksPage] = useState(1);
  const [checksTotal, setChecksTotal] = useState(0);
  const [balanceAsOf, setBalanceAsOf] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [banks, setBanks] = useState<Bank[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [checkbooks, setCheckbooks] = useState<Checkbook[]>([]);
  const [checkDeliveries, setCheckDeliveries] = useState<CheckDelivery[]>([]);
  const [deliveriesPage, setDeliveriesPage] = useState(1);
  const [deliveriesTotal, setDeliveriesTotal] = useState(0);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [depositsPage, setDepositsPage] = useState(1);
  const [depositsTotal, setDepositsTotal] = useState(0);
  const [eligibleCollections, setEligibleCollections] = useState<EligibleCollection[]>([]);
  const [collectionsPage, setCollectionsPage] = useState(1);
  const [collectionsTotal, setCollectionsTotal] = useState(0);
  const [eligibleCollectionCurrency, setEligibleCollectionCurrency] = useState("");
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [paymentOrdersPage, setPaymentOrdersPage] = useState(1);
  const [paymentOrdersTotal, setPaymentOrdersTotal] = useState(0);
  const [paymentHistory, setPaymentHistory] = useState<TreasuryReportRow[]>([]);
  const [paymentHistoryPage, setPaymentHistoryPage] = useState(1);
  const [paymentHistoryTotal, setPaymentHistoryTotal] = useState(0);
  const [paymentHistoryError, setPaymentHistoryError] = useState<string | null>(null);
  const [statusSummary, setStatusSummary] = useState<TreasuryStatusSummary>({ checks: {}, ledger: {} });
  const [statusSummaryOpen, setStatusSummaryOpen] = useState(false);
  const [statusSummaryLoading, setStatusSummaryLoading] = useState(false);
  const [statusSummaryError, setStatusSummaryError] = useState<string | null>(null);
  const [paymentSettlement, setPaymentSettlement] = useState<PaymentOrderSettlement | null>(null);
  const [loadingPaymentSettlement, setLoadingPaymentSettlement] = useState(false);
  const [paymentOrderId, setPaymentOrderId] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentBeneficiaryId, setPaymentBeneficiaryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_debit" | "check">("cash");
  const [paymentInstrumentId, setPaymentInstrumentId] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState(() => crypto.randomUUID());
  const [paymentId, setPaymentId] = useState(() => crypto.randomUUID());
  const [reportKind, setReportKind] = useState<TreasuryReportKind>("bank_ledger");
  const [reportFrom, setReportFrom] = useState("2000-01-01");
  const [reportTo, setReportTo] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [reportAccountId, setReportAccountId] = useState("");
  const [reportCurrency, setReportCurrency] = useState("");
  const [reportFormat, setReportFormat] = useState<"csv" | "pdf">("csv");
  const [exportingReport, setExportingReport] = useState(false);
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<Set<string>>(() => new Set());
  const [batchDeliveryResults, setBatchDeliveryResults] = useState<{ checkId: string; status: "recorded" | "failed"; message?: string }[]>([]);
  const [batchDeliveryRecipient, setBatchDeliveryRecipient] = useState("");
  const [batchDeliveryEvidence, setBatchDeliveryEvidence] = useState("");
  const [selected, setSelected] = useState<Account | null>(null);
  const [movementFrom, setMovementFrom] = useState("2000-01-01");
  const [movementTo, setMovementTo] = useState("");
  const [movementType, setMovementType] = useState("");
  const [movementSourceType, setMovementSourceType] = useState("");
  const [movementResponsible, setMovementResponsible] = useState("");
  const [movementStatus, setMovementStatus] = useState("");
  const [appliedMovementFilters, setAppliedMovementFilters] = useState({ from: "2000-01-01", to: "", type: "", sourceType: "", responsibleActorId: "" });
  const [appliedMovementStatus, setAppliedMovementStatus] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [checkStatus, setCheckStatus] = useState("");
  const [checkBankAccountId, setCheckBankAccountId] = useState("");
  const [checkBeneficiaryId, setCheckBeneficiaryId] = useState("");
  const [checkFrom, setCheckFrom] = useState("");
  const [checkTo, setCheckTo] = useState("");
  const [appliedCheckFilters, setAppliedCheckFilters] = useState({ number: "", status: "", bankAccountId: "", beneficiaryId: "", from: "", to: "" });
  const [postingMovement, setPostingMovement] = useState(false);
  const [postingMode, setPostingMode] = useState<"draft" | "publish">("draft");
  const [postingAmount, setPostingAmount] = useState("");
  const [postingConcept, setPostingConcept] = useState("");
  const [postingDirection, setPostingDirection] = useState<"credit" | "debit">("credit");
  const [postingType, setPostingType] = useState("cash_movement");
  const [postingDate, setPostingDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [postingIdempotencyKey, setPostingIdempotencyKey] = useState(() => crypto.randomUUID());
  const [postingEntryId, setPostingEntryId] = useState(() => crypto.randomUUID());
  const [reverseReasons, setReverseReasons] = useState<Record<string, string>>({});
  const [reversingEntryId, setReversingEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingCashBox, setCreatingCashBox] = useState(false);
  const [cashBoxCode, setCashBoxCode] = useState("");
  const [cashBoxName, setCashBoxName] = useState("");
  const [cashBoxCurrency, setCashBoxCurrency] = useState("VES");
  const [creatingBank, setCreatingBank] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [creatingBankAccount, setCreatingBankAccount] = useState(false);
  const [bankAccountBankId, setBankAccountBankId] = useState("");
  const [bankAccountHolder, setBankAccountHolder] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountCurrency, setBankAccountCurrency] = useState("VES");
  const [allowOverdraft, setAllowOverdraft] = useState(false);
  const [creatingBeneficiary, setCreatingBeneficiary] = useState(false);
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryTaxId, setBeneficiaryTaxId] = useState("");
  const [creatingCheckbook, setCreatingCheckbook] = useState(false);
  const [checkbookAccountId, setCheckbookAccountId] = useState("");
  const [checkbookFirst, setCheckbookFirst] = useState("");
  const [checkbookLast, setCheckbookLast] = useState("");
  const [issuingCheck, setIssuingCheck] = useState(false);
  const [issueCheckbookId, setIssueCheckbookId] = useState("");
  const [issueBeneficiaryId, setIssueBeneficiaryId] = useState("");
  const [issueAmount, setIssueAmount] = useState("");
  const [issueConcept, setIssueConcept] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [issueIdempotencyKey, setIssueIdempotencyKey] = useState(() => crypto.randomUUID());
  const [issueCheckId, setIssueCheckId] = useState(() => crypto.randomUUID());
  const [creatingDeposit, setCreatingDeposit] = useState(false);
  const [depositSourceMode, setDepositSourceMode] = useState<"cash" | "collections">("cash");
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(() => new Set());
  const [selectedCollectionRecords, setSelectedCollectionRecords] = useState<Record<string, EligibleCollection>>({});
  const [depositSourceId, setDepositSourceId] = useState("");
  const [depositDestinationId, setDepositDestinationId] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositDate, setDepositDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [depositReference, setDepositReference] = useState("");
  const [depositIdempotencyKey, setDepositIdempotencyKey] = useState(() => crypto.randomUUID());
  const [depositId, setDepositId] = useState(() => crypto.randomUUID());
  const [deliveringCheckId, setDeliveringCheckId] = useState<string | null>(null);
  const [checkRecipient, setCheckRecipient] = useState("");
  const [checkDeliveryEvidence, setCheckDeliveryEvidence] = useState("");
  const [undoingCheckId, setUndoingCheckId] = useState<string | null>(null);
  const [checkUndoReason, setCheckUndoReason] = useState("");

  const availableCheckbooks = useMemo(() => checkbooks.filter((item) => item.status === "active" && item.nextNumber <= item.lastNumber && accounts.some((account) => account.id === item.bankAccountId && account.status === "active")), [accounts, checkbooks]);
  const issuingCheckbook = useMemo(() => availableCheckbooks.find((item) => item.id === issueCheckbookId), [availableCheckbooks, issueCheckbookId]);
  const issuingAccount = useMemo(() => accounts.find((item) => item.id === issuingCheckbook?.bankAccountId && item.rowKind === "bank_account" && item.status === "active"), [accounts, issuingCheckbook?.bankAccountId]);
  const issuingBeneficiary = useMemo(() => beneficiaries.find((item) => item.id === issueBeneficiaryId && item.status === "active"), [beneficiaries, issueBeneficiaryId]);
  const depositSource = useMemo(() => accounts.find((item) => item.id === depositSourceId && item.rowKind === "cash_box" && item.status === "active"), [accounts, depositSourceId]);
  const depositDestination = useMemo(() => accounts.find((item) => item.id === depositDestinationId && item.rowKind === "bank_account" && item.status === "active"), [accounts, depositDestinationId]);
  const selectedCollections = useMemo(() => Object.values(selectedCollectionRecords).filter((item) => selectedCollectionIds.has(item.collectionId) && item.currency === depositDestination?.currency), [depositDestination?.currency, selectedCollectionIds, selectedCollectionRecords]);
  const groupedDepositAmount = useMemo(() => selectedCollections.reduce((total, item) => addDecimal(total, exactDecimal(item.availableAmount)), exactDecimal("0")), [selectedCollections]);

  const load = useCallback(async () => {
    if (!companyId || !organization) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const prefix = `/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/query`;
      const asOf = balanceAsOf;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const effectiveMovementTo = appliedMovementFilters.to || today;
      const query = async <T,>(kind: string, extra: Record<string, unknown> = {}): Promise<PageData<T>> => {
        const response = await fetch(prefix, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
          cache: "no-store",
          body: JSON.stringify({ kind, page: 1, pageSize: 100, ...extra }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo cargar Tesorería.");
        return payload.data as PageData<T>;
      };
      const queryCatalog = async <T,>(kind: string): Promise<PageData<T>> => {
        const firstPage = await query<T>(kind, { page: 1, pageSize: 500 });
        if (firstPage.total > 10_000) throw new Error(`El catálogo ${kind} supera el límite de 10.000 filas y requiere filtros.`);
        const items = [...firstPage.items];
        for (let page = 2; items.length < firstPage.total; page += 1) {
          const nextPage = await query<T>(kind, { page, pageSize: 500 });
          if (nextPage.total !== firstPage.total) throw new Error(`El catálogo ${kind} cambió mientras se cargaba. Actualiza la pantalla.`);
          if (nextPage.items.length === 0) break;
          items.push(...nextPage.items);
        }
        if (items.length < firstPage.total) throw new Error(`No se pudo completar el catálogo ${kind}.`);
        return { ...firstPage, items };
      };
      const canLoadPaymentHistory = canReadPaymentOrders("payment_orders.read") && reportFrom.length === 10 && reportTo.length === 10 && reportFrom <= reportTo;
      setPaymentHistoryError(null);
      const paymentHistoryRequest = canLoadPaymentHistory
        ? query<TreasuryReportRow>("treasury_report", { report: "payments", from: reportFrom, to: reportTo, page: paymentHistoryPage, pageSize: 50 }).catch((cause: unknown) => {
            setPaymentHistoryError(cause instanceof Error ? cause.message : "No se pudo cargar el historial de liquidaciones.");
            return { items: [] as TreasuryReportRow[], page: paymentHistoryPage, pageSize: 50, total: 0, asOf: "" };
          })
        : Promise.resolve({ items: [] as TreasuryReportRow[], page: paymentHistoryPage, pageSize: 50, total: 0, asOf: "" });
      const [bankAccounts, cash, issuedChecks, bankCatalog, beneficiaryCatalog, checkbookCatalog, deliveryRows, depositRows, collectionRows, paymentHistoryRows] = await Promise.all([
        queryCatalog<Account>("list_bank_accounts"), queryCatalog<Account>("list_cash_boxes"), query<Check>("list_checks", { page: checksPage, pageSize: 100, ...(appliedCheckFilters.number ? { number: appliedCheckFilters.number } : {}), ...(appliedCheckFilters.status ? { status: appliedCheckFilters.status } : {}), ...(appliedCheckFilters.bankAccountId ? { bankAccountId: appliedCheckFilters.bankAccountId } : {}), ...(appliedCheckFilters.beneficiaryId ? { beneficiaryId: appliedCheckFilters.beneficiaryId } : {}), ...(appliedCheckFilters.from ? { from: appliedCheckFilters.from } : {}), ...(appliedCheckFilters.to ? { to: appliedCheckFilters.to } : {}) }), queryCatalog<Bank>("list_banks"), queryCatalog<Beneficiary>("list_beneficiaries"), queryCatalog<Checkbook>("list_checkbooks"), query<CheckDelivery>("list_check_deliveries", { page: deliveriesPage, pageSize: 100 }), query<Deposit>("list_deposits", { page: depositsPage, pageSize: 100 }), query<EligibleCollection>("list_eligible_collections", { page: collectionsPage, pageSize: 100, ...(eligibleCollectionCurrency ? { currency: eligibleCollectionCurrency } : {}) }), paymentHistoryRequest,
      ]);
      const paymentOrdersResponse = canReadPaymentOrders("payment_orders.read")
        ? await fetch(`/api/security/payment-orders?companyId=${encodeURIComponent(companyId)}&offset=${(paymentOrdersPage - 1) * 100}&limit=100`, { cache: "no-store" })
        : null;
      if (paymentOrdersResponse?.ok) {
        const paymentOrderPayload = await paymentOrdersResponse.json() as { data?: { entries?: PaymentOrder[]; total?: number } };
        setPaymentOrders(paymentOrderPayload.data?.entries ?? []);
        setPaymentOrdersTotal(paymentOrderPayload.data?.total ?? 0);
      } else { setPaymentOrders([]); setPaymentOrdersTotal(0); }
      const allAccounts = [...bankAccounts.items, ...cash.items];
      setAccounts(allAccounts);
      setBanks(bankCatalog.items);
      setBeneficiaries(beneficiaryCatalog.items);
      setCheckbooks(checkbookCatalog.items);
      setCheckDeliveries(deliveryRows.items);
      setDeliveriesTotal(deliveryRows.total);
      setDeposits(depositRows.items);
      setDepositsTotal(depositRows.total);
      setEligibleCollections(collectionRows.items);
      setCollectionsTotal(collectionRows.total);
      setPaymentHistory(paymentHistoryRows.items);
      setPaymentHistoryTotal(paymentHistoryRows.total);
      setChecks(issuedChecks.items);
      setChecksTotal(issuedChecks.total);
      const balancePages = await Promise.all(allAccounts.map(async (account) => {
        const accountKind = account.rowKind === "cash_box" ? "cash_box" : "bank_account";
        const result = await query<Balance>("get_balance", {
          accountKind, accountId: account.id, asOf,
        });
        return [account.id, result.items[0] ?? { rowKind: "balance", accountId: account.id, currency: account.currency, balance: "0" }] as const;
      }));
      setBalances(Object.fromEntries(balancePages));
      const activeAccount = allAccounts.find((account) => account.id === selected?.id) ?? allAccounts[0] ?? null;
      setSelected(activeAccount);
      if (activeAccount) {
        const accountKind = activeAccount.rowKind === "cash_box" ? "cash_box" : "bank_account";
        const ledger = await query<LedgerEntry>("list_ledger_entries", {
          page: entriesPage, pageSize: 50,
          accountKind, accountId: activeAccount.id, from: appliedMovementFilters.from, to: effectiveMovementTo,
          ...(appliedMovementFilters.type ? { movementType: appliedMovementFilters.type } : {}), ...(appliedMovementFilters.sourceType ? { sourceType: appliedMovementFilters.sourceType } : {}),
          ...(appliedMovementStatus ? { status: appliedMovementStatus } : {}),
          ...(appliedMovementFilters.responsibleActorId ? { responsibleActorId: appliedMovementFilters.responsibleActorId } : {}),
        });
        setEntries(ledger.items);
        setEntriesTotal(ledger.total);
      } else { setEntries([]); setEntriesTotal(0); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar Tesorería.");
    } finally {
      setLoading(false);
    }
  }, [appliedCheckFilters, appliedMovementFilters, appliedMovementStatus, balanceAsOf, canReadPaymentOrders, checksPage, collectionsPage, companyId, deliveriesPage, depositsPage, eligibleCollectionCurrency, entriesPage, organization, paymentOrdersPage, paymentHistoryPage, reportFrom, reportTo, selected?.id]);

  const loadStatusSummary = useCallback(async () => {
    if (!companyId || !organization) return;
    setStatusSummaryLoading(true);
    setStatusSummaryError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const prefix = `/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/query`;
      const total = async (kind: string, filters: Record<string, unknown>): Promise<number> => {
        const response = await fetch(prefix, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
          cache: "no-store",
          body: JSON.stringify({ kind, page: 1, pageSize: 1, ...filters }),
        });
        const payload = await response.json() as { data?: { total?: number }; error?: { message?: string } };
        if (!response.ok || typeof payload.data?.total !== "number") throw new Error(payload.error?.message ?? "No se pudo calcular el resumen por estado.");
        return payload.data.total;
      };
      const checkFilters = {
        ...(appliedCheckFilters.number ? { number: appliedCheckFilters.number } : {}),
        ...(appliedCheckFilters.bankAccountId ? { bankAccountId: appliedCheckFilters.bankAccountId } : {}),
        ...(appliedCheckFilters.beneficiaryId ? { beneficiaryId: appliedCheckFilters.beneficiaryId } : {}),
        ...(appliedCheckFilters.from ? { from: appliedCheckFilters.from } : {}),
        ...(appliedCheckFilters.to ? { to: appliedCheckFilters.to } : {}),
      };
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const selectedAccountKind = selected?.rowKind === "bank_account" ? "bank_account" : "cash_box";
      const checkStatuses = ["issued", "delivered", "voided", "cleared"] as const;
      const ledgerStatuses = ["draft", "posted", "reversed"] as const;
      const checkTotals = await Promise.all(checkStatuses.map(async (status) => [status, await total("list_checks", { ...checkFilters, status })] as const));
      const ledgerTotals = selected ? await Promise.all(ledgerStatuses.map(async (status) => [status, await total("list_ledger_entries", {
          accountKind: selectedAccountKind,
          accountId: selected.id,
          from: appliedMovementFilters.from,
          to: appliedMovementFilters.to || today,
          ...(appliedMovementFilters.type ? { movementType: appliedMovementFilters.type } : {}),
          ...(appliedMovementFilters.sourceType ? { sourceType: appliedMovementFilters.sourceType } : {}),
          ...(appliedMovementFilters.responsibleActorId ? { responsibleActorId: appliedMovementFilters.responsibleActorId } : {}),
          status,
        })] as const)) : [];
      setStatusSummary({ checks: Object.fromEntries(checkTotals), ledger: Object.fromEntries(ledgerTotals) });
    } catch (cause) {
      setStatusSummaryError(cause instanceof Error ? cause.message : "No se pudo calcular el resumen por estado.");
    } finally {
      setStatusSummaryLoading(false);
    }
  }, [appliedCheckFilters, appliedMovementFilters, companyId, organization, selected?.id, selected?.rowKind]);

  const postingKinds = useMemo(() => selected?.rowKind === "cash_box" ? ["cash_movement", "cash_income", "cash_expense"] : ["bank_movement", "bank_debit", "bank_credit"], [selected?.rowKind]);
  const postMovement = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !can("treasury.post") || !selected || selected.status !== "active" || !postingKinds.includes(postingType)) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({
          kind: postingMode === "draft" ? "create_ledger_draft" : "post_ledger_entry", entryId: postingEntryId,
          account: { kind: selected.rowKind, id: selected.id, currency: selected.currency },
          direction: postingDirection, money: { amount: postingAmount, currency: selected.currency },
          operationalDate: postingDate, valueDate: postingDate, concept: postingConcept.trim(), movementType: postingType,
          ...(postingMode === "publish" ? { expectedAccountVersion: selected.version } : {}), idempotencyKey: postingIdempotencyKey, correlationId: postingIdempotencyKey,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setPostingIdempotencyKey(crypto.randomUUID()); setPostingEntryId(crypto.randomUUID()); await load(); }
        throw new Error(payload.error?.message ?? "No se pudo registrar el movimiento.");
      }
      setPostingAmount("");
      setPostingConcept("");
      setPostingIdempotencyKey(crypto.randomUUID());
      setPostingEntryId(crypto.randomUUID());
      setPostingMovement(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el movimiento.");
    } finally {
      setLoading(false);
    }
  }, [can, companyId, load, organization, postingAmount, postingConcept, postingDate, postingDirection, postingEntryId, postingIdempotencyKey, postingKinds, postingMode, postingType, selected]);

  const publishLedgerDraft = async (entry: LedgerEntry) => {
    if (!companyId || !organization || !selected || entry.status !== "draft" || !can("treasury.post")) return;
    setLoading(true); setError(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store", body: JSON.stringify({ kind: "post_ledger_draft", entryId: entry.id, expectedVersion: entry.version, expectedAccountVersion: selected.version, idempotencyKey, correlationId: idempotencyKey }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo publicar el borrador.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo publicar el borrador."); }
    finally { setLoading(false); }
  };

  const reverseLedgerEntry = async (event: React.FormEvent<HTMLFormElement>, entry: LedgerEntry) => {
    event.preventDefault();
    const reason = reverseReasons[entry.id]?.trim();
    if (!companyId || !organization || !reason || entry.status !== "posted" || !can("treasury.reverse")) return;
    setReversingEntryId(entry.id); setError(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store", body: JSON.stringify({ kind: "reverse_ledger_entry", reversalEntryId: crypto.randomUUID(), entryId: entry.id, reason, operationalDate: today, valueDate: today, expectedVersion: entry.version, idempotencyKey, correlationId: idempotencyKey }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo reversar el movimiento.");
      setReverseReasons((current) => ({ ...current, [entry.id]: "" })); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo reversar el movimiento."); }
    finally { setReversingEntryId(null); }
  };

  const exportTreasuryReport = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !can("treasury.read") || reportFrom > reportTo) return;
    setExportingReport(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/query`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store",
        body: JSON.stringify({ kind: "treasury_report", report: reportKind, from: reportFrom, to: reportTo, page: 1, pageSize: 10_000, ...(reportAccountId ? { accountId: reportAccountId } : {}), ...(reportCurrency ? { currency: reportCurrency } : {}) }),
      });
      const payload = await response.json() as { data?: PageData<TreasuryReportRow>; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "No se pudo generar el reporte.");
      if (payload.data.total > payload.data.items.length) throw new Error("El reporte supera 10.000 filas. Reduce el período o filtra por cuenta/moneda.");
      const titles: Record<TreasuryReportKind, string> = { cash_ledger: "Libro de caja", bank_ledger: "Libro de bancos", balances: "Saldos de tesorería", checks: "Cheques emitidos", deposits: "Depósitos", payments: "Pagos de órdenes", reconciliation: "Conciliaciones" };
      const snapshot: TreasuryReportSnapshot = { title: titles[reportKind], generatedAt: payload.data.asOf, columns: REPORT_COLUMNS[reportKind], rows: payload.data.items.map((item) => item.values) };
      let blob: Blob;
      let extension: string;
      if (reportFormat === "csv") {
        blob = new Blob(["\uFEFF", renderTreasuryCsv(snapshot)], { type: "text/csv;charset=utf-8" });
        extension = "csv";
      } else {
        const [{ JsPdfTreasuryReportRenderer }, { renderTreasuryPdf }] = await Promise.all([import("@kontave/treasury/pdf"), import("@kontave/treasury/application")]);
        const document = await renderTreasuryPdf(new JsPdfTreasuryReportRenderer("tesoreria"), snapshot);
        blob = new Blob([new Uint8Array(document.bytes).buffer], { type: document.mediaType });
        extension = "pdf";
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tesoreria-${reportKind}-${reportFrom}-${reportTo}.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo generar el reporte.");
    } finally {
      setExportingReport(false);
    }
  }, [can, companyId, organization, reportAccountId, reportCurrency, reportFormat, reportFrom, reportKind, reportTo]);

  const executePaymentOrder = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const order = paymentOrders.find((item) => item.id === paymentOrderId && item.status === "draft");
    const beneficiary = beneficiaries.find((item) => item.id === paymentBeneficiaryId && item.status === "active");
    const account = accounts.find((item) => item.id === paymentAccountId && item.status === "active");
    const check = checks.find((item) => item.id === paymentInstrumentId && item.status !== "voided");
    if (!companyId || !organization || !can("treasury.post") || !order || paymentSettlement?.settlementStatus !== "unpaid" || !beneficiary || !account || account.currency !== order.currency || (paymentMethod === "cash") !== (account.rowKind === "cash_box") || (paymentMethod === "check" && (!check || exactDecimal(check.amount) !== exactDecimal(order.amount) || check.currency !== order.currency))) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store",
        body: JSON.stringify({ kind: "execute_payment_order", paymentId, paymentOrderId: order.id, beneficiaryId: beneficiary.id, account: { kind: account.rowKind, id: account.id, currency: account.currency }, money: { amount: order.amount, currency: order.currency }, operationalDate: paymentDate, valueDate: paymentDate, method: paymentMethod, ...(paymentMethod === "check" ? { instrumentId: paymentInstrumentId } : {}), expectedAccountVersion: account.version, idempotencyKey: paymentIdempotencyKey, correlationId: paymentIdempotencyKey }),
      });
      const payload = await response.json();
      if (!response.ok) { if (response.status === 409) { setPaymentIdempotencyKey(crypto.randomUUID()); setPaymentId(crypto.randomUUID()); await load(); } throw new Error(payload.error?.message ?? "No se pudo pagar la orden."); }
      setPaymentIdempotencyKey(crypto.randomUUID()); setPaymentId(crypto.randomUUID());
      setPaymentOrderId("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo pagar la orden."); }
    finally { setLoading(false); }
  }, [accounts, beneficiaries, can, checks, companyId, load, organization, paymentAccountId, paymentBeneficiaryId, paymentDate, paymentId, paymentIdempotencyKey, paymentInstrumentId, paymentMethod, paymentOrderId, paymentOrders, paymentSettlement]);

  const issueCheck = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !can("treasury.checks") || !issuingCheckbook || !issuingAccount || !issuingBeneficiary || issuingCheckbook.nextNumber > issuingCheckbook.lastNumber) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({
          kind: "issue_check", checkId: issueCheckId, checkbookId: issuingCheckbook.id, bankAccountId: issuingAccount.id,
          number: issuingCheckbook.nextNumber, beneficiaryId: issuingBeneficiary.id,
          beneficiarySnapshot: JSON.stringify({ legalName: issuingBeneficiary.legalName, taxIdentifier: issuingBeneficiary.taxIdentifier }),
          money: { amount: issueAmount, currency: issuingAccount.currency }, issueDate, concept: issueConcept.trim(),
          expectedCheckbookVersion: issuingCheckbook.version, expectedBankAccountVersion: issuingAccount.version,
          idempotencyKey: issueIdempotencyKey, correlationId: issueIdempotencyKey,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setIssueIdempotencyKey(crypto.randomUUID()); setIssueCheckId(crypto.randomUUID()); await load(); }
        throw new Error(payload.error?.message ?? "No se pudo emitir el cheque.");
      }
      setIssueAmount("");
      setIssueConcept("");
      setIssueIdempotencyKey(crypto.randomUUID());
      setIssueCheckId(crypto.randomUUID());
      setIssuingCheck(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo emitir el cheque.");
    } finally {
      setLoading(false);
    }
  }, [can, companyId, issueAmount, issueCheckId, issueConcept, issueDate, issueIdempotencyKey, issuingAccount, issuingBeneficiary, issuingCheckbook, load, organization]);

  const createDeposit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !can("treasury.post") || !depositDestination) return;
    if (depositSourceMode === "cash" && (!depositSource || depositSource.currency !== depositDestination.currency)) return;
    if (depositSourceMode === "collections" && (selectedCollections.length === 0 || selectedCollections.length !== selectedCollectionIds.size)) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({
          kind: "create_deposit", depositId, destinationBankAccountId: depositDestination.id,
          ...(depositSourceMode === "cash" && depositSource ? { sourceAccount: { kind: "cash_box", id: depositSource.id, currency: depositSource.currency }, expectedSourceVersion: depositSource.version } : {}),
          ...(depositSourceMode === "collections" ? { collectionAllocations: selectedCollections.map((item) => ({ collectionId: item.collectionId, amount: { amount: item.availableAmount, currency: item.currency } })) } : {}),
          money: { amount: depositSourceMode === "cash" ? depositAmount : groupedDepositAmount, currency: depositDestination.currency },
          depositDate, reference: depositReference.trim(), expectedDestinationVersion: depositDestination.version,
          idempotencyKey: depositIdempotencyKey, correlationId: depositIdempotencyKey,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setDepositIdempotencyKey(crypto.randomUUID()); setDepositId(crypto.randomUUID()); setSelectedCollectionIds(new Set()); setSelectedCollectionRecords({}); await load(); }
        throw new Error(payload.error?.message ?? "No se pudo registrar el depósito.");
      }
      setDepositAmount("");
      setDepositReference("");
      setSelectedCollectionIds(new Set());
      setSelectedCollectionRecords({});
      setDepositIdempotencyKey(crypto.randomUUID());
      setDepositId(crypto.randomUUID());
      setCreatingDeposit(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el depósito.");
    } finally {
      setLoading(false);
    }
  }, [can, companyId, depositAmount, depositDate, depositDestination, depositId, depositIdempotencyKey, depositReference, depositSource, depositSourceMode, groupedDepositAmount, load, organization, selectedCollectionIds.size, selectedCollections]);

  const createCashBox = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !can("treasury.manage")) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token || !session.user.id) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const prefix = `/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`;
      const response = await fetch(prefix, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({
          kind: "create_cash_box", cashBoxId: crypto.randomUUID(), code: cashBoxCode.trim(),
          name: cashBoxName.trim(), currency: cashBoxCurrency, responsibleActorId: session.user.id,
          idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo crear la caja.");
      setCashBoxCode("");
      setCashBoxName("");
      setCreatingCashBox(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la caja.");
    } finally {
      setLoading(false);
    }
  }, [can, cashBoxCode, cashBoxCurrency, cashBoxName, companyId, load, organization]);

  const createBank = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !can("treasury.manage")) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({ kind: "create_bank", bankId: crypto.randomUUID(), code: bankCode.trim(), name: bankName.trim(), countryCode: "VE", idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo registrar el banco.");
      setBankCode("");
      setBankName("");
      setCreatingBank(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el banco.");
    } finally {
      setLoading(false);
    }
  }, [bankCode, bankName, can, companyId, load, organization]);

  const createBankAccount = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !can("treasury.manage")) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({ kind: "create_bank_account", bankAccountId: crypto.randomUUID(), bankId: bankAccountBankId, holderName: bankAccountHolder.trim(), accountNumber: bankAccountNumber.trim(), currency: bankAccountCurrency, allowOverdraft, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo registrar la cuenta bancaria.");
      setBankAccountBankId("");
      setBankAccountHolder("");
      setBankAccountNumber("");
      setBankAccountCurrency("VES");
      setAllowOverdraft(false);
      setCreatingBankAccount(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar la cuenta bancaria.");
    } finally {
      setLoading(false);
    }
  }, [allowOverdraft, bankAccountBankId, bankAccountCurrency, bankAccountHolder, bankAccountNumber, can, companyId, load, organization]);

  const createBeneficiary = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !can("treasury.manage")) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({ kind: "create_beneficiary", beneficiaryId: crypto.randomUUID(), legalName: beneficiaryName.trim(), ...(beneficiaryTaxId.trim() ? { taxIdentifier: beneficiaryTaxId.trim() } : {}), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo registrar el beneficiario.");
      setBeneficiaryName("");
      setBeneficiaryTaxId("");
      setCreatingBeneficiary(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el beneficiario.");
    } finally {
      setLoading(false);
    }
  }, [beneficiaryName, beneficiaryTaxId, can, companyId, load, organization]);

  const createCheckbook = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId || !organization || !can("treasury.manage")) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({ kind: "create_checkbook", checkbookId: crypto.randomUUID(), bankAccountId: checkbookAccountId, firstNumber: Number(checkbookFirst), lastNumber: Number(checkbookLast), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo crear la chequera.");
      setCheckbookAccountId("");
      setCheckbookFirst("");
      setCheckbookLast("");
      setCreatingCheckbook(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la chequera.");
    } finally {
      setLoading(false);
    }
  }, [can, checkbookAccountId, checkbookFirst, checkbookLast, companyId, load, organization]);

  const recordCheckDelivery = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const check = checks.find((item) => item.id === deliveringCheckId);
    if (!companyId || !organization || !can("treasury.checks") || !check) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({ kind: "record_check_delivery", deliveryEventId: crypto.randomUUID(), checkId: check.id, recipientName: checkRecipient.trim(), deliveredAt: new Date().toISOString(), ...(checkDeliveryEvidence.trim() ? { evidenceReference: checkDeliveryEvidence.trim() } : {}), expectedVersion: check.version, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo registrar la entrega del cheque.");
      setCheckRecipient("");
      setCheckDeliveryEvidence("");
      setDeliveringCheckId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar la entrega del cheque.");
    } finally {
      setLoading(false);
    }
  }, [can, checkDeliveryEvidence, checkRecipient, checks, companyId, deliveringCheckId, load, organization]);

  const undoCheckDelivery = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const check = checks.find((item) => item.id === undoingCheckId);
    if (!companyId || !organization || !can("treasury.reverse") || !check) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({ kind: "undo_check_delivery", deliveryEventId: crypto.randomUUID(), checkId: check.id, reason: checkUndoReason.trim(), expectedVersion: check.version, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo deshacer la entrega.");
      setCheckUndoReason("");
      setUndoingCheckId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo deshacer la entrega.");
    } finally {
      setLoading(false);
    }
  }, [can, checkUndoReason, checks, companyId, load, organization, undoingCheckId]);

  const recordSelectedCheckDeliveries = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedChecks = checks.filter((check) => selectedDeliveryIds.has(check.id) && check.status === "issued");
    if (!companyId || !organization || !can("treasury.checks") || selectedChecks.length === 0) return;
    setLoading(true);
    setError(null);
    setBatchDeliveryResults([]);
    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      const response = await fetch(`/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" },
        cache: "no-store",
        body: JSON.stringify({
          kind: "record_check_deliveries_batch",
          commands: selectedChecks.map((check) => ({
            deliveryEventId: crypto.randomUUID(), checkId: check.id, recipientName: batchDeliveryRecipient.trim(),
            deliveredAt: new Date().toISOString(), ...(batchDeliveryEvidence.trim() ? { evidenceReference: batchDeliveryEvidence.trim() } : {}),
            expectedVersion: check.version, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo procesar el lote de entregas.");
      const outcomes = payload.data as { checkId: string; status: "recorded" | "failed"; message?: string }[];
      setBatchDeliveryResults(outcomes);
      setSelectedDeliveryIds(new Set(outcomes.filter((outcome) => outcome.status === "failed").map((outcome) => outcome.checkId)));
      setBatchDeliveryRecipient("");
      setBatchDeliveryEvidence("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo procesar el lote de entregas.");
    } finally {
      setLoading(false);
    }
  }, [batchDeliveryEvidence, batchDeliveryRecipient, can, checks, companyId, load, organization, selectedDeliveryIds]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const selectedOrder = paymentOrders.find((order) => order.id === paymentOrderId);
    if (!paymentOrderId || !companyId || !organization || !canReadPaymentOrders("payment_orders.read")) {
      setPaymentSettlement(null);
      setLoadingPaymentSettlement(false);
      return;
    }
    if (selectedOrder?.status === "cancelled") {
      setPaymentSettlement({ settlementStatus: "cancelled", execution: null, remainingAmount: selectedOrder.amount });
      setLoadingPaymentSettlement(false);
      return;
    }
    const controller = new AbortController();
    setPaymentSettlement(null);
    void (async () => {
      setLoadingPaymentSettlement(true);
      try {
        const { data: { session } } = await getSupabaseBrowser().auth.getSession();
        if (!session?.access_token) throw new Error("La sesión expiró. Inicia sesión nuevamente.");
        const queryUrl = `/api/client/v1/organizations/${encodeURIComponent(organization.id)}/companies/${encodeURIComponent(companyId)}/treasury/query`;
        const response = await fetch(queryUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-kontave-client": "web" }, cache: "no-store", signal: controller.signal, body: JSON.stringify({ kind: "get_payment_order_execution", paymentOrderId, page: 1, pageSize: 2 }) });
        const payload = await response.json() as { data?: PageData<PaymentOrderExecution>; error?: { message?: string } };
        if (!response.ok || !payload.data || payload.data.items.length > 1) throw new Error(payload.error?.message ?? "No se pudo consultar el estado del pago.");
        const execution = payload.data.items[0];
        setPaymentSettlement({ settlementStatus: execution ? "paid" : "unpaid", execution: execution ? { paymentId: execution.paymentId, occurredOn: execution.occurredOn, ledgerEntryId: execution.ledgerEntryId } : null, remainingAmount: execution ? "0" : selectedOrder?.amount ?? "0" });
      } catch (cause) {
        if (!controller.signal.aborted) setPaymentSettlement(null);
      } finally {
        if (!controller.signal.aborted) setLoadingPaymentSettlement(false);
      }
    })();
    return () => controller.abort();
  }, [canReadPaymentOrders, companyId, organization, paymentOrderId, paymentOrders]);
  useEffect(() => { setPostingType(selected?.rowKind === "bank_account" ? "bank_movement" : "cash_movement"); }, [selected?.rowKind]);
  useEffect(() => { setEntriesPage(1); }, [appliedMovementFilters, selected?.id]);
  useEffect(() => { setPaymentOrdersPage(1); setPaymentHistoryPage(1); }, [companyId]);
  useEffect(() => { setPaymentHistoryPage(1); }, [reportFrom, reportTo]);
  useEffect(() => { if (statusSummaryOpen) void loadStatusSummary(); }, [loadStatusSummary, statusSummaryOpen]);
  const activeCount = useMemo(() => accounts.filter((account) => account.status === "active").length, [accounts]);

  return <main className="min-h-full space-y-6 p-6">
    <PageHeader title="Tesorería" subtitle="Caja, bancos, cheques emitidos y movimientos" />
    <div className="flex justify-end"><Link href="/treasury/reconciliation" className="rounded-lg border border-default-300 bg-content1 px-3 py-2 text-sm font-medium">Conciliación bancaria</Link></div>
    <section className="rounded-xl border border-default-200 bg-content1 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Resumen por estado</h2><p className="text-sm text-default-500">Conteo de cada estado, respetando los demas filtros aplicados.</p></div><button type="button" aria-expanded={statusSummaryOpen} onClick={() => setStatusSummaryOpen((open) => !open)} className="rounded-lg border border-default-300 px-3 py-2 text-sm">{statusSummaryOpen ? "Ocultar resumen" : "Consultar resumen"}</button></div>{statusSummaryOpen && <div className="mt-4 space-y-4">{statusSummaryLoading && <p role="status" className="text-sm text-default-500">Calculando totales…</p>}{statusSummaryError && <p role="alert" className="text-sm text-danger-700">{statusSummaryError}</p>}<div className="grid gap-4 md:grid-cols-2"><div className="rounded-lg bg-default-100 p-4"><h3 className="mb-3 text-sm font-semibold">Cheques</h3><dl className="grid grid-cols-2 gap-2 text-sm">{[["Emitidos", "issued"], ["Entregados", "delivered"], ["Anulados", "voided"], ["Conciliados", "cleared"]].map(([label, status]) => <div key={status} className="flex justify-between gap-2"><dt className="text-default-600">{label}</dt><dd className="font-medium">{statusSummary.checks[status] ?? 0}</dd></div>)}</dl></div><div className="rounded-lg bg-default-100 p-4"><h3 className="mb-3 text-sm font-semibold">Movimientos{selected ? ` · ${selected.holderName ?? selected.name ?? selected.code ?? selected.id}` : ""}</h3><dl className="grid grid-cols-2 gap-2 text-sm">{[["Borrador", "draft"], ["Confirmados", "posted"], ["Reversados", "reversed"]].map(([label, status]) => <div key={status} className="flex justify-between gap-2"><dt className="text-default-600">{label}</dt><dd className="font-medium">{statusSummary.ledger[status] ?? 0}</dd></div>)}</dl></div></div></div>}</section>
    <section className="grid gap-4 rounded-xl border border-default-200 bg-content1 p-4 md:grid-cols-2">
      <div className="space-y-3">
        <h2 className="font-semibold">Consulta del libro</h2>
        <label className="grid max-w-xs gap-1 text-sm">Saldo a la fecha<input required type="date" value={balanceAsOf} onChange={(event) => { if (event.target.value) setBalanceAsOf(event.target.value); }} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <label className="grid max-w-xs gap-1 text-sm">Estado del movimiento<select value={movementStatus} onChange={(event) => setMovementStatus(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Todos</option><option value="draft">Borrador</option><option value="posted">Confirmado</option><option value="reversed">Reversado</option></select></label>
        <div className="flex items-center gap-2 text-sm"><button type="button" disabled={entriesPage <= 1 || loading} onClick={() => setEntriesPage((page) => page - 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Anterior</button><span>Página {entriesPage} · {entriesTotal} movimientos</span><button type="button" disabled={entriesPage * 50 >= entriesTotal || loading} onClick={() => setEntriesPage((page) => page + 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Siguiente</button></div>
      </div>
      <div className="space-y-3">
        <h2 className="font-semibold">Consulta de cheques</h2>
        <label className="grid max-w-xs gap-1 text-sm">Número exacto<input inputMode="numeric" value={checkNumber} onChange={(event) => setCheckNumber(event.target.value.replace(/\D/g, ""))} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <label className="grid max-w-xs gap-1 text-sm">Cuenta<select value={checkBankAccountId} onChange={(event) => setCheckBankAccountId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Todas</option>{accounts.filter((account) => account.rowKind === "bank_account").map((account) => <option key={account.id} value={account.id}>{account.holderName ?? account.accountNumberMasked} · {account.currency}</option>)}</select></label>
        <label className="grid max-w-xs gap-1 text-sm">Beneficiario<select value={checkBeneficiaryId} onChange={(event) => setCheckBeneficiaryId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Todos</option>{beneficiaries.map((beneficiary) => <option key={beneficiary.id} value={beneficiary.id}>{beneficiary.legalName}</option>)}</select></label>
        <label className="grid max-w-xs gap-1 text-sm">Desde<input type="date" max={checkTo || undefined} value={checkFrom} onChange={(event) => setCheckFrom(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <label className="grid max-w-xs gap-1 text-sm">Hasta<input type="date" min={checkFrom || undefined} value={checkTo} onChange={(event) => setCheckTo(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label>
        <label className="grid max-w-xs gap-1 text-sm">Estado<select value={checkStatus} onChange={(event) => setCheckStatus(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Todos</option><option value="issued">Emitido</option><option value="delivered">Entregado</option><option value="voided">Anulado</option><option value="cleared">Conciliado</option></select></label>
        <div className="flex items-center gap-2 text-sm"><button type="button" disabled={checksPage <= 1 || loading} onClick={() => setChecksPage((page) => page - 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Anterior</button><span>Página {checksPage} · {checksTotal} cheques</span><button type="button" disabled={checksPage * 100 >= checksTotal || loading} onClick={() => setChecksPage((page) => page + 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Siguiente</button></div>
        <button type="button" onClick={() => { setChecksPage(1); setAppliedCheckFilters({ number: checkNumber, status: checkStatus, bankAccountId: checkBankAccountId, beneficiaryId: checkBeneficiaryId, from: checkFrom, to: checkTo }); setEntriesPage(1); setAppliedMovementStatus(movementStatus); }} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">Aplicar estado y filtros</button>
      </div>
    </section>
    <section className="grid gap-3 rounded-xl border border-default-200 bg-content1 p-4 sm:grid-cols-2">
      <div className="flex items-center justify-between gap-3 text-sm"><span>Historial de entregas · página {deliveriesPage} de {Math.max(1, Math.ceil(deliveriesTotal / 100))} ({deliveriesTotal})</span><div className="flex gap-2"><button type="button" disabled={deliveriesPage <= 1 || loading} onClick={() => setDeliveriesPage((page) => page - 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Anterior</button><button type="button" disabled={deliveriesPage * 100 >= deliveriesTotal || loading} onClick={() => setDeliveriesPage((page) => page + 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Siguiente</button></div></div>
      <div className="flex items-center justify-between gap-3 text-sm"><span>Depósitos · página {depositsPage} de {Math.max(1, Math.ceil(depositsTotal / 100))} ({depositsTotal})</span><div className="flex gap-2"><button type="button" disabled={depositsPage <= 1 || loading} onClick={() => setDepositsPage((page) => page - 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Anterior</button><button type="button" disabled={depositsPage * 100 >= depositsTotal || loading} onClick={() => setDepositsPage((page) => page + 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Siguiente</button></div></div>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default-200 bg-content1 p-4">
      <div><p className="text-sm text-default-500">Empresa activa</p><p className="font-medium">{companyId ?? "Selecciona una empresa"}</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-default-300 px-3 py-2 text-sm disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Actualizar</button>{can("treasury.manage") && <><button type="button" onClick={() => setCreatingCashBox((value) => !value)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">{creatingCashBox ? "Cerrar caja" : "Crear caja"}</button><button type="button" onClick={() => setCreatingBank((value) => !value)} className="rounded-lg border border-primary px-3 py-2 text-sm font-medium text-primary">{creatingBank ? "Cerrar banco" : "Registrar banco"}</button><button type="button" onClick={() => setCreatingBankAccount((value) => !value)} disabled={!banks.length} className="rounded-lg border border-default-300 px-3 py-2 text-sm disabled:opacity-50">{creatingBankAccount ? "Cerrar cuenta" : "Agregar cuenta bancaria"}</button><button type="button" onClick={() => setCreatingBeneficiary((value) => !value)} className="rounded-lg border border-default-300 px-3 py-2 text-sm">{creatingBeneficiary ? "Cerrar beneficiario" : "Agregar beneficiario"}</button><button type="button" onClick={() => setCreatingCheckbook((value) => !value)} disabled={!accounts.some((account) => account.rowKind === "bank_account")} className="rounded-lg border border-default-300 px-3 py-2 text-sm disabled:opacity-50">{creatingCheckbook ? "Cerrar chequera" : "Crear chequera"}</button></>}</div>
    </div>
    {creatingCashBox && <form onSubmit={createCashBox} className="grid gap-3 rounded-xl border border-default-200 bg-content1 p-5 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1 text-sm">Código<input required maxLength={40} value={cashBoxCode} onChange={(event) => setCashBoxCode(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Nombre<input required maxLength={120} value={cashBoxName} onChange={(event) => setCashBoxName(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Moneda<input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={cashBoxCurrency} onChange={(event) => setCashBoxCurrency(event.target.value.toUpperCase())} className="rounded-lg border border-default-300 bg-background px-3 py-2 uppercase" /></label><button type="submit" disabled={loading} className="self-end rounded-lg bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">Guardar caja</button></form>}
    {creatingBank && <form onSubmit={createBank} className="grid gap-3 rounded-xl border border-default-200 bg-content1 p-5 sm:grid-cols-[1fr_2fr_auto]"><label className="grid gap-1 text-sm">Código<input required maxLength={40} value={bankCode} onChange={(event) => setBankCode(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Institución bancaria<input required maxLength={120} value={bankName} onChange={(event) => setBankName(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><button type="submit" disabled={loading} className="self-end rounded-lg bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">Guardar banco</button></form>}
    {creatingBankAccount && <form onSubmit={createBankAccount} className="grid gap-3 rounded-xl border border-default-200 bg-content1 p-5 sm:grid-cols-2 lg:grid-cols-3"><label className="grid gap-1 text-sm">Banco<select required value={bankAccountBankId} onChange={(event) => setBankAccountBankId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name} · {bank.code}</option>)}</select></label><label className="grid gap-1 text-sm">Titular<input required maxLength={160} value={bankAccountHolder} onChange={(event) => setBankAccountHolder(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Número de cuenta<input required minLength={8} maxLength={34} autoComplete="off" value={bankAccountNumber} onChange={(event) => setBankAccountNumber(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Moneda<input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={bankAccountCurrency} onChange={(event) => setBankAccountCurrency(event.target.value.toUpperCase())} className="rounded-lg border border-default-300 bg-background px-3 py-2 uppercase" /></label><label className="flex items-center gap-2 self-end py-2 text-sm"><input type="checkbox" checked={allowOverdraft} onChange={(event) => setAllowOverdraft(event.target.checked)} />Permitir sobregiro</label><button type="submit" disabled={loading} className="self-end rounded-lg bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">Guardar cuenta</button></form>}
    {creatingBeneficiary && <form onSubmit={createBeneficiary} className="grid gap-3 rounded-xl border border-default-200 bg-content1 p-5 sm:grid-cols-[2fr_1fr_auto]"><label className="grid gap-1 text-sm">Nombre o razón social<input required maxLength={160} value={beneficiaryName} onChange={(event) => setBeneficiaryName(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">RIF o identificación<input maxLength={32} value={beneficiaryTaxId} onChange={(event) => setBeneficiaryTaxId(event.target.value.toUpperCase())} className="rounded-lg border border-default-300 bg-background px-3 py-2 uppercase" /></label><button type="submit" disabled={loading} className="self-end rounded-lg bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">Guardar beneficiario</button></form>}
    {creatingCheckbook && <form onSubmit={createCheckbook} className="grid gap-3 rounded-xl border border-default-200 bg-content1 p-5 sm:grid-cols-[2fr_1fr_1fr_auto]"><label className="grid gap-1 text-sm">Cuenta bancaria<select required value={checkbookAccountId} onChange={(event) => setCheckbookAccountId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{accounts.filter((account) => account.rowKind === "bank_account").map((account) => <option key={account.id} value={account.id}>{account.holderName ?? account.accountNumberMasked} · {account.currency}</option>)}</select></label><label className="grid gap-1 text-sm">Primer folio<input required type="number" min="1" step="1" value={checkbookFirst} onChange={(event) => setCheckbookFirst(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Último folio<input required type="number" min={checkbookFirst || "1"} step="1" value={checkbookLast} onChange={(event) => setCheckbookLast(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><button type="submit" disabled={loading} className="self-end rounded-lg bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">Guardar chequera</button></form>}
    {error && <div role="alert" className="rounded-lg border border-danger-300 bg-danger-50 p-4 text-sm text-danger-700">{error}</div>}
    {canReadPaymentOrders("payment_orders.read") && <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="border-b border-default-200 p-5"><h2 className="font-semibold">Órdenes de pago pendientes</h2><p className="text-sm text-default-500">La orden conserva su estado administrativo; al pagarla se registra una ejecución separada y el débito correspondiente.</p><p className="px-5 pb-3 text-xs text-default-500">Selecciona manualmente el registro activo de Tesorer?a que corresponde al beneficiario indicado en la orden. El ID seleccionado queda guardado en la ejecuci?n del pago.</p>{paymentSettlement && <p className="px-5 pb-3 text-sm" role="status">Estado de liquidación: {paymentSettlement.settlementStatus === "paid" ? `Pagada el ${paymentSettlement.execution?.occurredOn ?? ""}` : paymentSettlement.settlementStatus === "cancelled" ? "Anulada" : "Pendiente"}{paymentSettlement.execution ? ` · Asiento ${paymentSettlement.execution.ledgerEntryId}` : ""}</p>}</div><form onSubmit={executePaymentOrder} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1 text-sm">Orden<select required value={paymentOrderId} onChange={(event) => { const order = paymentOrders.find((item) => item.id === event.target.value); setPaymentSettlement(null); setLoadingPaymentSettlement(true); setPaymentOrderId(event.target.value); setPaymentAccountId(""); setPaymentBeneficiaryId(""); }} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{paymentOrders.filter((item) => item.status === "draft").map((item) => <option key={item.id} value={item.id}>{item.beneficiary} · {item.amount} {item.currency} · {item.concept}</option>)}</select></label><label className="grid gap-1 text-sm">Caja o cuenta<select required value={paymentAccountId} onChange={(event) => setPaymentAccountId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{accounts.filter((item) => item.status === "active" && item.currency === paymentOrders.find((order) => order.id === paymentOrderId)?.currency && ((paymentMethod === "cash") === (item.rowKind === "cash_box"))).map((item) => <option key={item.id} value={item.id}>{item.holderName ?? item.name ?? item.code ?? item.id} · {item.currency}</option>)}</select></label><label className="grid gap-1 text-sm">Beneficiario de Tesorer?a<select required value={paymentBeneficiaryId} onChange={(event) => setPaymentBeneficiaryId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{beneficiaries.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.legalName}</option>)}</select></label><label className="grid gap-1 text-sm">Forma de pago<select value={paymentMethod} onChange={(event) => { const method = event.target.value as "cash" | "bank_debit" | "check"; setPaymentMethod(method); setPaymentAccountId(""); setPaymentInstrumentId(""); }} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="cash">Efectivo</option><option value="bank_debit">Débito bancario</option><option value="check">Cheque ya emitido</option></select></label>{paymentMethod === "check" && <label className="grid gap-1 text-sm">Cheque<select required value={paymentInstrumentId} onChange={(event) => setPaymentInstrumentId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{checks.filter((item) => item.status === "issued" || item.status === "delivered" || item.status === "cleared").filter((item) => { const order = paymentOrders.find((row) => row.id === paymentOrderId); const account = accounts.find((row) => row.id === paymentAccountId); return exactDecimal(item.amount) === exactDecimal(order?.amount ?? "0") && item.currency === order?.currency && item.bankAccountId === account?.id; }).map((item) => <option key={item.id} value={item.id}>Folio {item.number} · {item.amount} {item.currency}</option>)}</select></label>}<label className="grid gap-1 text-sm">Fecha de operación<input type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><button type="submit" disabled={loading || loadingPaymentSettlement || (!!paymentOrderId && !paymentSettlement) || paymentSettlement?.settlementStatus !== "unpaid" || !can("treasury.post") || !paymentOrders.some((item) => item.id === paymentOrderId && item.status === "draft")} className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Registrar pago</button></form><div className="flex items-center justify-between gap-3 px-4 pb-4 text-sm"><span>Pag. {paymentOrdersPage} ({paymentOrdersTotal} ordenes)</span><div className="flex gap-2"><button type="button" disabled={paymentOrdersPage <= 1 || loading} onClick={() => setPaymentOrdersPage((page) => page - 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Anterior</button><button type="button" disabled={paymentOrders.length < 100 || loading} onClick={() => setPaymentOrdersPage((page) => page + 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Siguiente</button></div></div></section>}
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="border-b border-default-200 p-5"><h2 className="font-semibold">Historial de liquidaciones</h2><p className="text-sm text-default-500">Ejecuciones de ordenes de pago.</p></div><div className="grid gap-3 border-b border-default-200 p-4 sm:grid-cols-2"><label className="grid gap-1 text-sm">Desde<input type="date" value={reportFrom} max={reportTo || undefined} onChange={(event) => setReportFrom(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Hasta<input type="date" value={reportTo} min={reportFrom || undefined} onChange={(event) => setReportTo(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label></div>{paymentHistoryError && <p role="alert" className="border-b border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{paymentHistoryError}</p>}{(reportFrom.length !== 10 || reportTo.length !== 10 || reportFrom > reportTo) && <p role="status" className="border-b border-default-200 p-4 text-sm text-default-500">Selecciona un rango de fechas valido.</p>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-default-100 text-default-600"><tr><th className="p-3">Fecha</th><th className="p-3">Orden</th><th className="p-3">Pago</th><th className="p-3">Metodo</th><th className="p-3">Cuenta</th><th className="p-3 text-right">Monto</th><th className="p-3">Asiento</th></tr></thead><tbody>{paymentHistory.map((row) => <tr key={String(row.values.paymentId)} className="border-t border-default-100"><td className="p-3">{String(row.values.valueDate ?? "--")}</td><td className="p-3">{String(row.values.paymentOrderId ?? "--")}</td><td className="p-3">{String(row.values.paymentId ?? "--")}</td><td className="p-3">{String(row.values.method ?? "--")}</td><td className="p-3">{String(row.values.accountId ?? "--")}</td><td className="p-3 text-right">{String(row.values.amount ?? "--")} {String(row.values.currency ?? "")}</td><td className="p-3">{String(row.values.ledgerEntryId ?? "--")}</td></tr>)}{paymentHistory.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-sm text-default-500">No hay liquidaciones en este rango.</td></tr>}</tbody></table></div><div className="flex items-center justify-between gap-3 p-4 text-sm"><span>Pag. {paymentHistoryPage} ({paymentHistoryTotal} liquidaciones)</span><div className="flex gap-2"><button type="button" disabled={paymentHistoryPage <= 1 || loading} onClick={() => setPaymentHistoryPage((page) => page - 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Anterior</button><button type="button" disabled={paymentHistoryPage * 50 >= paymentHistoryTotal || loading} onClick={() => setPaymentHistoryPage((page) => page + 1)} className="rounded border border-default-300 px-3 py-1 disabled:opacity-50">Siguiente</button></div></div></section>
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="border-b border-default-200 p-5"><h2 className="font-semibold">Reportes de tesorería</h2><p className="text-sm text-default-500">Exporta el snapshot autorizado a CSV o PDF. Cada archivo contiene hasta 10.000 filas de una sola lectura.</p></div><form onSubmit={exportTreasuryReport} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1 text-sm">Reporte<select value={reportKind} onChange={(event) => setReportKind(event.target.value as TreasuryReportKind)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="cash_ledger">Libro de caja</option><option value="bank_ledger">Libro de bancos</option><option value="balances">Saldos</option><option value="checks">Cheques</option><option value="deposits">Depósitos</option><option value="payments">Pagos de órdenes</option><option value="reconciliation">Conciliaciones</option></select></label><label className="grid gap-1 text-sm">Desde<input type="date" required value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Hasta<input type="date" required value={reportTo} onChange={(event) => setReportTo(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Cuenta (opcional)<select value={reportAccountId} onChange={(event) => setReportAccountId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Todas</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.holderName ?? account.name ?? account.code ?? account.id} · {account.currency}</option>)}</select></label><label className="grid gap-1 text-sm">Moneda (opcional)<input maxLength={3} pattern="[A-Za-z]{3}" value={reportCurrency} onChange={(event) => setReportCurrency(event.target.value.toUpperCase())} className="rounded-lg border border-default-300 bg-background px-3 py-2 uppercase" /></label><label className="grid gap-1 text-sm">Formato<select value={reportFormat} onChange={(event) => setReportFormat(event.target.value as "csv" | "pdf")} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="csv">CSV</option><option value="pdf">PDF</option></select></label><button type="submit" disabled={exportingReport || !can("treasury.read") || reportFrom > reportTo} className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{exportingReport ? "Generando…" : "Exportar reporte"}</button></form></section>
    <section className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-default-200 bg-content1 p-5"><Landmark className="mb-3 text-primary" size={20} /><p className="text-sm text-default-500">Cuentas de caja y banco</p><p className="mt-1 text-2xl font-semibold">{accounts.length}</p><p className="text-xs text-default-500">{activeCount} activas · {banks.length} bancos</p></div>
      <div className="rounded-xl border border-default-200 bg-content1 p-5"><WalletCards className="mb-3 text-primary" size={20} /><p className="text-sm text-default-500">Cheques emitidos</p><p className="mt-1 text-2xl font-semibold">{checksTotal}</p><p className="text-xs text-default-500">Coinciden con los filtros aplicados</p></div>
      <div className="rounded-xl border border-default-200 bg-content1 p-5"><Landmark className="mb-3 text-primary" size={20} /><p className="text-sm text-default-500">Movimientos del libro</p><p className="mt-1 text-2xl font-semibold">{entriesTotal}</p><p className="text-xs text-default-500">Coinciden con los filtros aplicados</p></div>
    </section>
    <section className="rounded-xl border border-default-200 bg-content1 p-5"><h2 className="mb-4 font-semibold">Saldos al {balanceAsOf}</h2>{accounts.length === 0 && <p className="text-sm text-default-500">No hay saldos para mostrar.</p>}<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{accounts.map((account) => <li key={account.id} className="rounded-lg bg-default-100 p-4"><p className="text-sm text-default-500">{account.holderName ?? account.name ?? account.code ?? "Cuenta"}</p><p className="mt-1 text-xl font-semibold">{balances[account.id]?.balance ?? "—"} <span className="text-sm font-normal">{account.currency}</span></p></li>)}</ul></section>
    <section className="grid gap-6 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.6fr)]">
      <div className="rounded-xl border border-default-200 bg-content1 p-5"><h2 className="mb-4 font-semibold">Cuentas</h2>{accounts.length === 0 && <p className="text-sm text-default-500">No hay cuentas registradas para esta empresa.</p>}<ul className="space-y-2">{accounts.map((account) => <li key={account.id}><button type="button" onClick={() => setSelected(account)} className={`w-full rounded-lg border p-3 text-left ${selected?.id === account.id ? "border-primary bg-primary-50" : "border-default-200"}`}><span className="block font-medium">{account.holderName ?? account.name ?? account.code ?? "Cuenta"}</span><span className="text-xs text-default-500">{account.rowKind === "cash_box" ? "Caja" : "Banco"} · {account.accountNumberMasked ?? account.currency} · {account.status}</span></button></li>)}</ul></div>
      <div className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-default-200 p-5"><div><h2 className="font-semibold">Movimientos</h2><p className="text-sm text-default-500">{selected?.holderName ?? selected?.name ?? "Selecciona una cuenta"}</p></div>{selected?.status === "active" && can("treasury.post") && <button type="button" onClick={() => setPostingMovement((value) => !value)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">{postingMovement ? "Cerrar registro" : "Registrar movimiento"}</button>}</div>{postingMovement && selected && can("treasury.post") && <form onSubmit={postMovement} className="grid gap-3 border-b border-default-200 p-4 sm:grid-cols-2 lg:grid-cols-5"><label className="grid gap-1 text-sm">Fecha<input required type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Acción<select required value={postingMode} onChange={(event) => setPostingMode(event.target.value as "draft" | "publish")} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="draft">Guardar borrador</option><option value="publish">Publicar ahora</option></select></label><label className="grid gap-1 text-sm">Tipo<select required value={postingType} onChange={(event) => { const kind = event.target.value; setPostingType(kind); if (kind === "cash_income" || kind === "bank_credit") setPostingDirection("credit"); if (kind === "cash_expense" || kind === "bank_debit") setPostingDirection("debit"); }} className="rounded-lg border border-default-300 bg-background px-3 py-2">{postingKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label>{(postingType === "cash_movement" || postingType === "bank_movement") && <label className="grid gap-1 text-sm">Dirección<select value={postingDirection} onChange={(event) => setPostingDirection(event.target.value as "credit" | "debit")} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="credit">Ingreso / crédito</option><option value="debit">Egreso / débito</option></select></label>}<label className="grid gap-1 text-sm">Importe ({selected.currency})<input required type="number" min="0.01" step="0.01" value={postingAmount} onChange={(event) => setPostingAmount(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Concepto<input required maxLength={240} value={postingConcept} onChange={(event) => setPostingConcept(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><p className="text-xs text-default-500 lg:col-span-4">El servidor calcula la valuación empresarial y registra el movimiento una sola vez.</p><button type="submit" disabled={loading} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{postingMode === "draft" ? "Guardar borrador" : "Publicar movimiento"}</button></form>}<form onSubmit={(event) => { event.preventDefault(); setAppliedMovementFilters({ from: movementFrom, to: movementTo, type: movementType, sourceType: movementSourceType, responsibleActorId: movementResponsible }); }} className="grid gap-3 border-b border-default-200 p-4 sm:grid-cols-2 lg:grid-cols-5"><label className="grid gap-1 text-xs">Desde<input required type="date" value={movementFrom} onChange={(event) => setMovementFrom(event.target.value)} className="rounded-lg border border-default-300 bg-background px-2 py-2 text-sm" /></label><label className="grid gap-1 text-xs">Hasta<input type="date" value={movementTo} onChange={(event) => setMovementTo(event.target.value)} className="rounded-lg border border-default-300 bg-background px-2 py-2 text-sm" /></label><label className="grid gap-1 text-xs">Tipo<select value={movementType} onChange={(event) => setMovementType(event.target.value)} className="rounded-lg border border-default-300 bg-background px-2 py-2 text-sm"><option value="">Todos</option>{["cash_movement", "cash_income", "cash_expense", "bank_movement", "bank_debit", "bank_credit", "check_issue", "payment_order", "deposit", "reversal", "tax"].map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label><label className="grid gap-1 text-xs">Origen<input maxLength={80} value={movementSourceType} onChange={(event) => setMovementSourceType(event.target.value)} placeholder="Tipo de origen" className="rounded-lg border border-default-300 bg-background px-2 py-2 text-sm" /></label><label className="grid gap-1 text-xs">Responsable (ID)<input maxLength={120} value={movementResponsible} onChange={(event) => setMovementResponsible(event.target.value)} className="rounded-lg border border-default-300 bg-background px-2 py-2 text-sm" /></label><button type="submit" disabled={loading} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 lg:col-span-5">Aplicar filtros</button></form><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-default-100 text-default-600"><tr><th className="p-3">Fecha</th><th className="p-3">Concepto</th><th className="p-3">Tipo / origen</th><th className="p-3">Estado</th><th className="p-3">Responsable</th><th className="p-3 text-right">Monto</th><th className="p-3">Acciones</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-t border-default-100"><td className="whitespace-nowrap p-3">{entry.operationalDate}</td><td className="p-3">{entry.concept}</td><td className="p-3">{entry.movementType}{entry.sourceType ? ` · ${entry.sourceType}` : ""}</td><td className="p-3">{entry.status}</td><td className="p-3">{entry.responsibleActorId ?? "—"}</td><td className="whitespace-nowrap p-3 text-right">{entry.direction === "debit" ? "−" : "+"}{entry.amount} {entry.currency}</td><td className="min-w-64 p-3">{entry.status === "draft" && can("treasury.post") && <button type="button" disabled={loading} onClick={() => void publishLedgerDraft(entry)} className="text-primary underline disabled:opacity-50">Publicar borrador</button>}{entry.status === "posted" && can("treasury.reverse") && <form onSubmit={(event) => void reverseLedgerEntry(event, entry)} className="flex items-center gap-2"><input required maxLength={500} aria-label={`Motivo para reversar ${entry.concept}`} value={reverseReasons[entry.id] ?? ""} onChange={(event) => setReverseReasons((current) => ({ ...current, [entry.id]: event.target.value }))} placeholder="Motivo de reverso" className="min-w-32 rounded border border-default-300 bg-background px-2 py-1" /><button type="submit" disabled={loading || reversingEntryId === entry.id || !reverseReasons[entry.id]?.trim()} className="text-primary underline disabled:opacity-50">{reversingEntryId === entry.id ? "Reversando…" : "Reversar"}</button></form>}{entry.status === "reversed" && <span className="text-default-500">Reversado</span>}</td></tr>)}{entries.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-default-500">{loading ? "Cargando movimientos…" : "Esta cuenta aún no tiene movimientos."}</td></tr>}</tbody></table></div></div>
    </section>
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="border-b border-default-200 p-5"><h2 className="font-semibold">Beneficiarios</h2><p className="text-sm text-default-500">Datos reutilizables para las órdenes y pagos.</p></div><ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{beneficiaries.map((beneficiary) => <li key={beneficiary.id} className="rounded-lg border border-default-200 p-4"><p className="font-medium">{beneficiary.legalName}</p><p className="text-sm text-default-500">{beneficiary.taxIdentifier ?? "Sin identificación"} · {beneficiary.status === "active" ? "Activo" : "Inactivo"}</p>{beneficiary.bankDetails.map((detail) => <p key={detail.id} className="mt-2 text-xs text-default-500">{detail.accountHolder} · {detail.accountNumberMasked} · {detail.currency}</p>)}</li>)}{beneficiaries.length === 0 && <li className="p-4 text-sm text-default-500">No hay beneficiarios registrados.</li>}</ul></section>
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-default-200 p-5"><div><h2 className="font-semibold">Depósitos bancarios</h2><p className="text-sm text-default-500">Traslado de caja o agrupación de cobranzas a cuenta bancaria.</p></div>{can("treasury.post") && <button type="button" onClick={() => setCreatingDeposit((value) => !value)} disabled={!accounts.some((item) => item.rowKind === "bank_account" && item.status === "active") || (!accounts.some((item) => item.rowKind === "cash_box" && item.status === "active") && eligibleCollections.length === 0)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{creatingDeposit ? "Cerrar depósito" : "Registrar depósito"}</button>}</div>{creatingDeposit && can("treasury.post") && <form onSubmit={createDeposit} className="grid gap-3 border-b border-default-200 p-4 sm:grid-cols-2 lg:grid-cols-5"><label className="grid gap-1 text-sm">Origen del depósito<select value={depositSourceMode} onChange={(event) => { setDepositSourceMode(event.target.value as "cash" | "collections"); setSelectedCollectionIds(new Set()); setSelectedCollectionRecords({}); setCollectionsPage(1); }} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="cash">Traslado desde caja</option><option value="collections">Agrupar cobranzas</option></select></label>{depositSourceMode === "cash" && <label className="grid gap-1 text-sm">Caja de origen<select required value={depositSourceId} onChange={(event) => setDepositSourceId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{accounts.filter((item) => item.rowKind === "cash_box" && item.status === "active" && (!depositDestination || item.currency === depositDestination.currency)).map((item) => <option key={item.id} value={item.id}>{item.name ?? item.code ?? item.id} · {item.currency}</option>)}</select></label>}{depositSourceMode === "collections" && <fieldset className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-default-200 p-3 text-sm lg:col-span-2"><legend className="px-1">Cobranzas disponibles</legend>{eligibleCollections.filter((item) => item.currency === depositDestination?.currency).map((item) => <label key={item.collectionId} className="flex items-start gap-2 border-b border-default-100 py-2"><input type="checkbox" checked={selectedCollectionIds.has(item.collectionId)} onChange={(event) => { const checked = event.target.checked; setSelectedCollectionIds((current) => { const next = new Set(current); if (checked) next.add(item.collectionId); else next.delete(item.collectionId); return next; }); setSelectedCollectionRecords((current) => { const next = { ...current }; if (checked) next[item.collectionId] = item; else delete next[item.collectionId]; return next; }); }} /><span><span className="block">{item.availableAmount} {item.currency} · {item.receivedAt.slice(0,10)}</span><span className="text-xs text-default-500">Cobro {item.collectionId}</span></span></label>)}{eligibleCollections.filter((item) => item.currency === depositDestination?.currency).length === 0 && <p className="text-default-500">No hay cobranzas disponibles en esta moneda.</p>}<div className="flex items-center justify-between gap-2 border-t border-default-200 pt-2 text-xs"><span>Pag. {collectionsPage} - {collectionsTotal} cobranzas</span><div className="flex gap-2"><button type="button" disabled={collectionsPage <= 1 || loading} onClick={() => setCollectionsPage((page) => page - 1)} className="rounded border border-default-300 px-2 py-1 disabled:opacity-50">Anterior</button><button type="button" disabled={collectionsPage * 100 >= collectionsTotal || loading} onClick={() => setCollectionsPage((page) => page + 1)} className="rounded border border-default-300 px-2 py-1 disabled:opacity-50">Siguiente</button></div></div></fieldset>}<label className="grid gap-1 text-sm">Cuenta destino<select required value={depositDestinationId} onChange={(event) => { setDepositDestinationId(event.target.value); setSelectedCollectionIds(new Set()); setSelectedCollectionRecords({}); setCollectionsPage(1); setEligibleCollectionCurrency(accounts.find((account) => account.id === event.target.value)?.currency ?? ""); }} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{accounts.filter((item) => item.rowKind === "bank_account" && item.status === "active" && (depositSourceMode !== "cash" || !depositSource || item.currency === depositSource.currency)).map((item) => <option key={item.id} value={item.id}>{item.holderName ?? item.accountNumberMasked ?? item.id} · {item.currency}</option>)}</select></label>{depositSourceMode === "cash" ? <label className="grid gap-1 text-sm">Importe ({depositSource?.currency ?? "moneda"})<input required type="number" min="0.01" step="0.01" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label> : <div className="rounded-lg bg-default-100 p-3 text-sm">Total seleccionado: {groupedDepositAmount} {depositDestination?.currency ?? ""}</div>}<label className="grid gap-1 text-sm">Fecha<input required type="date" value={depositDate} onChange={(event) => setDepositDate(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Referencia<input required maxLength={120} value={depositReference} onChange={(event) => setDepositReference(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><p className="text-xs text-default-500 lg:col-span-4">El traslado verifica fondos y ambas versiones; las cobranzas quedan reservadas atómicamente y no pueden reutilizarse en otro depósito.</p><button type="submit" disabled={loading || !depositDestination || (depositSourceMode === "cash" && (!depositSource || depositSource.currency !== depositDestination.currency)) || (depositSourceMode === "collections" && (selectedCollections.length === 0 || selectedCollections.length !== selectedCollectionIds.size))} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Confirmar depósito</button></form>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-default-100 text-default-600"><tr><th className="p-3">Fecha</th><th className="p-3">Cuenta destino</th><th className="p-3">Referencia</th><th className="p-3 text-right">Monto</th></tr></thead><tbody>{deposits.map((deposit) => <tr key={deposit.id} className="border-t border-default-100"><td className="p-3">{deposit.depositDate}</td><td className="p-3">{accounts.find((item) => item.id === deposit.destinationBankAccountId)?.holderName ?? "Cuenta bancaria"}</td><td className="p-3">{deposit.reference}</td><td className="p-3 text-right">{deposit.amount} {deposit.currency}</td></tr>)}{deposits.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-sm text-default-500">No hay depósitos registrados.</td></tr>}</tbody></table></div></section>    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="border-b border-default-200 p-5"><h2 className="font-semibold">Chequeras</h2><p className="text-sm text-default-500">El siguiente folio se reclama de forma atómica al emitir.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-default-100 text-default-600"><tr><th className="p-3">Cuenta</th><th className="p-3">Rango</th><th className="p-3">Siguiente folio</th><th className="p-3">Estado</th></tr></thead><tbody>{checkbooks.map((checkbook) => <tr key={checkbook.id} className="border-t border-default-100"><td className="p-3">{accounts.find((account) => account.id === checkbook.bankAccountId)?.holderName ?? "Cuenta bancaria"}</td><td className="p-3">{checkbook.firstNumber}–{checkbook.lastNumber}</td><td className="p-3">{checkbook.nextNumber > checkbook.lastNumber ? "Agotada" : checkbook.nextNumber}</td><td className="p-3">{checkbook.status === "active" ? "Activa" : "Cerrada"}</td></tr>)}{checkbooks.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-sm text-default-500">No hay chequeras registradas.</td></tr>}</tbody></table></div></section>
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-default-200 p-5"><div><h2 className="font-semibold">Cheques emitidos</h2><p className="text-sm text-default-500">El saldo bancario se afecta al emitir el cheque.</p></div>{can("treasury.checks") && <button type="button" onClick={() => { const next = availableCheckbooks[0]; setIssueCheckbookId(next?.id ?? ""); setIssueBeneficiaryId(beneficiaries.find((item) => item.status === "active")?.id ?? ""); setIssuingCheck((value) => !value); }} disabled={!availableCheckbooks.length || !beneficiaries.some((item) => item.status === "active")} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{issuingCheck ? "Cerrar emisión" : "Emitir cheque"}</button>}</div>{issuingCheck && <form onSubmit={issueCheck} className="grid gap-3 border-b border-default-200 p-4 sm:grid-cols-2 lg:grid-cols-5"><label className="grid gap-1 text-sm">Chequera<select required value={issueCheckbookId} onChange={(event) => setIssueCheckbookId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{availableCheckbooks.map((item) => <option key={item.id} value={item.id}>{accounts.find((account) => account.id === item.bankAccountId)?.holderName ?? "Cuenta bancaria"} · próximo folio {item.nextNumber}</option>)}</select></label><label className="grid gap-1 text-sm">Beneficiario<select required value={issueBeneficiaryId} onChange={(event) => setIssueBeneficiaryId(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2"><option value="">Selecciona</option>{beneficiaries.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.legalName}</option>)}</select></label><label className="grid gap-1 text-sm">Importe ({issuingAccount?.currency ?? "moneda"})<input required type="number" min="0.01" step="0.01" value={issueAmount} onChange={(event) => setIssueAmount(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Fecha de emisión<input required type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Concepto<input required maxLength={240} value={issueConcept} onChange={(event) => setIssueConcept(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><p className="text-xs text-default-500 lg:col-span-4">Folio asignado: {issuingCheckbook?.nextNumber ?? "—"}. El saldo se debita al emitir.</p><button type="submit" disabled={loading || !issuingCheckbook || !issuingAccount || !issuingBeneficiary} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Confirmar emisión</button></form>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-default-100 text-default-600"><tr><th className="p-3">Número</th><th className="p-3">Fecha</th><th className="p-3">Estado</th><th className="p-3 text-right">Monto</th><th className="p-3">Acción</th></tr></thead><tbody>{checks.map((check) => <tr key={check.id} className="border-t border-default-100"><td className="p-3">{check.number}</td><td className="p-3">{check.issueDate}</td><td className="p-3">{check.status}</td><td className="p-3 text-right">{check.amount} {check.currency}</td><td className="p-3">{can("treasury.checks") && check.status === "issued" && <button type="button" onClick={() => { setDeliveringCheckId(check.id); setCheckRecipient(""); setCheckDeliveryEvidence(""); }} className="text-primary underline">Registrar entrega</button>}{can("treasury.reverse") && check.status === "delivered" && <button type="button" onClick={() => { setUndoingCheckId(check.id); setCheckUndoReason(""); }} className="text-primary underline">Deshacer entrega</button>}</td></tr>)}{checks.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-default-500">No hay cheques emitidos.</td></tr>}</tbody></table></div>{deliveringCheckId && <form onSubmit={recordCheckDelivery} className="grid gap-3 border-t border-default-200 p-4 sm:grid-cols-[1fr_1fr_auto]"><label className="grid gap-1 text-sm">Recibido por<input required maxLength={120} value={checkRecipient} onChange={(event) => setCheckRecipient(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Referencia de evidencia (opcional)<input maxLength={240} value={checkDeliveryEvidence} onChange={(event) => setCheckDeliveryEvidence(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><button type="submit" disabled={loading} className="self-end rounded-lg bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">Confirmar entrega</button></form>}{undoingCheckId && <form onSubmit={undoCheckDelivery} className="grid gap-3 border-t border-default-200 p-4 sm:grid-cols-[1fr_auto]"><label className="grid gap-1 text-sm">Motivo para deshacer la entrega<input required maxLength={240} value={checkUndoReason} onChange={(event) => setCheckUndoReason(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><button type="submit" disabled={loading} className="self-end rounded-lg border border-danger bg-danger-50 px-4 py-2 font-medium text-danger disabled:opacity-50">Confirmar reversión</button></form>}</section>
    {can("treasury.checks") && <section className="rounded-xl border border-default-200 bg-content1 p-5"><h2 className="font-semibold">Entrega masiva de cheques</h2><p className="mb-4 text-sm text-default-500">Selecciona hasta 100 cheques pendientes. Cada entrega se confirma por separado.</p><div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{checks.filter((check) => check.status === "issued").map((check) => <label key={check.id} className="flex items-center gap-2 rounded-lg border border-default-200 p-3 text-sm"><input type="checkbox" checked={selectedDeliveryIds.has(check.id)} disabled={!selectedDeliveryIds.has(check.id) && selectedDeliveryIds.size >= 100} onChange={(event) => setSelectedDeliveryIds((current) => { const next = new Set(current); if (event.target.checked) next.add(check.id); else next.delete(check.id); return next; })} />Cheque {check.number} · {check.amount} {check.currency}</label>)}</div><form onSubmit={recordSelectedCheckDeliveries} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"><label className="grid gap-1 text-sm">Recibidos por<input required maxLength={120} value={batchDeliveryRecipient} onChange={(event) => setBatchDeliveryRecipient(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">Evidencia común (opcional)<input maxLength={240} value={batchDeliveryEvidence} onChange={(event) => setBatchDeliveryEvidence(event.target.value)} className="rounded-lg border border-default-300 bg-background px-3 py-2" /></label><button type="submit" disabled={loading || selectedDeliveryIds.size === 0} className="self-end rounded-lg bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">Registrar {selectedDeliveryIds.size} entregas</button></form>{batchDeliveryResults.length > 0 && <ul className="mt-4 space-y-1 text-sm">{batchDeliveryResults.map((result) => <li key={result.checkId} className={result.status === "failed" ? "text-danger" : "text-success"}>Cheque {checks.find((check) => check.id === result.checkId)?.number ?? result.checkId}: {result.status === "recorded" ? "entrega registrada" : result.message ?? "no procesado"}</li>)}</ul>}</section>}
    <section className="overflow-hidden rounded-xl border border-default-200 bg-content1"><div className="border-b border-default-200 p-5"><h2 className="font-semibold">Control e historial de entregas</h2><p className="text-sm text-default-500">Pendientes, entregas confirmadas y eventos compensatorios.</p></div><ul className="divide-y divide-default-100">{checkDeliveries.map((delivery) => <li key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">Cheque {checks.find((check) => check.id === delivery.checkId)?.number ?? delivery.checkId}</p><p className="text-sm text-default-500">{delivery.recipientName ?? delivery.reason ?? "Pendiente de entrega"} · {delivery.eventType} · {delivery.occurredAt}</p></div>{delivery.evidenceReference && <span className="text-xs text-default-500">Evidencia: {delivery.evidenceReference}</span>}</li>)}{checkDeliveries.length === 0 && <li className="p-6 text-center text-sm text-default-500">No hay entregas pendientes ni historial registrado.</li>}</ul></section>
  </main>;
}
