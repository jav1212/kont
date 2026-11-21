import { compareDecimal, exactDecimal, type ExactDecimal } from "@kontave/monetary/domain";
import {
  SalesFailure,
  allocateFinancierDeposits,
  compareFinancedSaleJournalEntries,
  completedMonthEnds,
  financedSaleRevaluationJournalEntries,
  revalueFinancedSalesAtMonthEnds,
  salesDate,
  type FinancedSaleRevaluation,
  type MonthEndRate,
  type FinancedSaleAccountRole,
  type FinancedSaleJournalEntry,
  type FinancedSaleTerms,
  type SalesDate,
  type UnappliedFinancierDeposit,
} from "../domain";
import {
  buildFinancedSalesJournal,
  summarizeFinancedSaleSettlements,
  type FinancedSaleReportRow,
  type FinancedSalesExchangeDifferenceReport,
  type UsdVesRateHistory,
} from "./financed-sales-exchange-difference-report";
import type { FinancedSaleRoleAccounts } from "./financed-sales-journal-publication";

/** Where a stored rate came from. */
export type LedgerRateSource = "bcv" | "manual";

/** Company configuration of the financed-sales ledger. */
export interface FinancedSalesLedgerSettings {
  readonly financierName: string;
  /** Default upfront percentage for new sales. */
  readonly upfrontPercent: ExactDecimal;
  /** Default commission percentage for new deposits. */
  readonly commissionPercent: ExactDecimal;
  readonly journalGranularity: "daily" | "monthly";
  /** Whether open balances are revalued at each month end (unrealized difference). */
  readonly revalueMonthEnd: boolean;
  readonly accounts: FinancedSaleRoleAccounts;
  /** Optimistic concurrency version; 0 when never saved. */
  readonly version: number;
}

/** Defaults applied until a company saves its own settings. */
export const DEFAULT_FINANCED_SALES_LEDGER_SETTINGS: FinancedSalesLedgerSettings = Object.freeze({
  financierName: "Cashea",
  upfrontPercent: exactDecimal("60"),
  commissionPercent: exactDecimal("0"),
  journalGranularity: "monthly",
  revalueMonthEnd: false,
  accounts: Object.freeze({}),
  version: 0,
});

/** Persisted financed sale with its rate snapshot. */
export interface FinancedSaleRecord {
  readonly id: string;
  readonly saleDate: SalesDate;
  readonly amountVes: ExactDecimal;
  readonly upfrontPercent: ExactDecimal;
  readonly vesPerUsd: ExactDecimal;
  readonly rateSource: LedgerRateSource;
  readonly note: string | null;
}

/** Persisted financier deposit with its rate snapshot. */
export interface FinancierDepositRecord {
  readonly id: string;
  readonly depositDate: SalesDate;
  /** Net VES received in the bank. */
  readonly amountVes: ExactDecimal;
  readonly vesPerUsd: ExactDecimal;
  readonly rateSource: LedgerRateSource;
  readonly commissionPercent: ExactDecimal;
  readonly reference: string | null;
  /** Treasury bank ledger entry this deposit was reconciled with, or `null`. */
  readonly bankEntryId: string | null;
}

/** Complete stored state of one company ledger. */
export interface FinancedSalesLedgerState {
  readonly settings: FinancedSalesLedgerSettings;
  readonly sales: readonly FinancedSaleRecord[];
  readonly deposits: readonly FinancierDepositRecord[];
}

/** Persistence port owned by the ledger. */
export interface FinancedSalesLedgerRepository {
  /**
   * Loads settings, sales and deposits of a company.
   * @param companyId - Company that owns the ledger.
   * @returns Stored state; default settings when none were saved.
   * @throws {SalesFailure} `SALES_REPOSITORY_UNAVAILABLE` on storage failure.
   */
  load(companyId: string): Promise<FinancedSalesLedgerState>;
  /**
   * Saves settings when the stored version still equals `expectedVersion`.
   * @param companyId - Company that owns the ledger.
   * @param settings - New settings; its version is ignored.
   * @param expectedVersion - Version the caller read.
   * @returns The saved settings with their new version.
   * @throws {SalesFailure} `SALES_CONCURRENCY_CONFLICT` when another change won.
   */
  saveSettings(companyId: string, settings: FinancedSalesLedgerSettings, expectedVersion: number): Promise<FinancedSalesLedgerSettings>;
  /**
   * Inserts sales in one transaction.
   * @param companyId - Company that owns the ledger.
   * @param sales - New records with caller-generated identifiers.
   * @returns Completion after every record is durable.
   */
  addSales(companyId: string, sales: readonly FinancedSaleRecord[]): Promise<void>;
  /**
   * Inserts deposits in one transaction.
   * @param companyId - Company that owns the ledger.
   * @param deposits - New records with caller-generated identifiers.
   * @returns Completion after every record is durable.
   */
  addDeposits(companyId: string, deposits: readonly FinancierDepositRecord[]): Promise<void>;
  /**
   * Deletes one sale or deposit of the company; absent records are ignored.
   * @param companyId - Company that owns the ledger.
   * @param kind - Record kind.
   * @param id - Record identifier.
   * @returns Completion after deletion.
   */
  remove(companyId: string, kind: "sale" | "deposit", id: string): Promise<void>;
  /**
   * Sets or clears the bank ledger entry of deposits in one transaction.
   * @param companyId - Company that owns the ledger.
   * @param links - Deposit identifiers with their bank entry, or `null` to unlink.
   * @returns Completion after every link is durable.
   * @throws {SalesFailure} `SALES_CONCURRENCY_CONFLICT` when a bank entry is already linked to another deposit.
   */
  setBankLinks(companyId: string, links: readonly { readonly depositId: string; readonly bankEntryId: string | null }[]): Promise<void>;
}

/** Outcome of synchronizing the ledger journal with Accounting. */
export interface FinancedSalesJournalSyncResult {
  readonly status: "synced" | "skipped_missing_accounts" | "blocked_conflict" | "failed";
  readonly created: number;
  readonly updated: number;
  readonly removed: number;
  readonly alreadyPosted: number;
  /** `YYYY-MM` months whose entries have no open period. */
  readonly monthsWithoutPeriod: readonly string[];
  readonly message?: string;
}

/** Port that writes the ledger journal as draft entries in Accounting. */
export interface FinancedSalesJournalSink {
  /**
   * Upserts the proposed entries as drafts and removes this ledger's orphaned drafts.
   * Posted entries are never modified.
   * @param companyId - Company that owns the journal.
   * @param entries - Proposed entries with stable keys.
   * @param granularity - Granularity the entries were built with.
   * @param accounts - Posting account per role.
   * @returns What was written; failures are reported, not thrown.
   */
  sync(companyId: string, entries: readonly FinancedSaleJournalEntry[], granularity: "daily" | "monthly", accounts: FinancedSaleRoleAccounts): Promise<FinancedSalesJournalSyncResult>;
}

/** Calculated view of one company ledger. */
export interface FinancedSalesLedgerView extends Pick<FinancedSalesExchangeDifferenceReport, "months" | "totals"> {
  readonly settings: FinancedSalesLedgerSettings;
  readonly sales: readonly { readonly record: FinancedSaleRecord; readonly row: FinancedSaleReportRow; readonly depositIds: readonly string[] }[];
  readonly deposits: readonly FinancierDepositRecord[];
  readonly unapplied: readonly UnappliedFinancierDeposit[];
  /** Month-end revaluations when enabled in the settings. */
  readonly revaluations: readonly FinancedSaleRevaluation[];
  /** Why revaluations could not be calculated, when enabled. */
  readonly revaluationError: string | null;
  readonly journal: readonly FinancedSaleJournalEntry[];
}

/** New sale entered by a user; the rate is resolved from the official history when omitted. */
export interface NewFinancedSale {
  readonly saleDate: string;
  readonly amountVes: string;
  readonly upfrontPercent?: string;
  readonly vesPerUsd?: string;
  readonly note?: string | null;
}

/** New deposit entered by a user; the rate is resolved from the official history when omitted. */
export interface NewFinancierDeposit {
  readonly depositDate: string;
  readonly amountVes: string;
  readonly commissionPercent?: string;
  readonly vesPerUsd?: string;
  readonly reference?: string | null;
  /** Treasury bank ledger entry the deposit comes from, when created from the bank. */
  readonly bankEntryId?: string | null;
}

/** Result of a ledger change: the recalculated view and the accounting synchronization. */
export interface FinancedSalesLedgerChange {
  readonly view: FinancedSalesLedgerView;
  readonly journalSync: FinancedSalesJournalSyncResult;
}

const MAX_BATCH = 1000;
const REQUIRED_ROLES: readonly FinancedSaleAccountRole[] = ["bank", "financier_receivable", "sales", "exchange_gain", "exchange_loss"];

/**
 * Persisted ledger of sales financed by a third party: users record daily sales
 * and financier deposits, deposits are applied first-in first-out at their own
 * official rate, and every change re-synchronizes the draft journal in Accounting.
 */
export class FinancedSalesLedger {
  /**
   * Creates the ledger service.
   * @param repository - Ledger persistence.
   * @param rates - Official USD rate history used when a rate is omitted.
   * @param journal - Accounting draft synchronization.
   * @param newId - Identifier generator for new records.
   * @param describeMonth - Description of monthly summary and revaluation entries.
   * @param today - Current business date; month ends after it are not revalued.
   */
  constructor(
    private readonly repository: FinancedSalesLedgerRepository,
    private readonly rates: UsdVesRateHistory,
    private readonly journal: FinancedSalesJournalSink,
    private readonly newId: () => string,
    private readonly describeMonth: (kind: FinancedSaleJournalEntry["kind"], month: string) => string,
    private readonly today: () => SalesDate,
  ) {}

  /**
   * Loads and calculates the ledger.
   * @param companyId - Company that owns the ledger.
   * @returns The calculated view.
   * @throws {SalesFailure} When storage fails or stored data is inconsistent.
   */
  async view(companyId: string): Promise<FinancedSalesLedgerView> {
    return this.withRevaluation(this.calculate(await this.repository.load(companyId)));
  }

  /**
   * Records sales and re-synchronizes the journal.
   * @param companyId - Company that owns the ledger.
   * @param sales - Up to 1000 new sales.
   * @returns The recalculated view and synchronization result.
   * @throws {SalesFailure} `SALES_FINANCED_SALE_INVALID` for invalid input or a date without
   * official rate, or `SALES_REPOSITORY_UNAVAILABLE` when storage or rates fail.
   */
  async addSales(companyId: string, sales: readonly NewFinancedSale[]): Promise<FinancedSalesLedgerChange> {
    if (!sales.length || sales.length > MAX_BATCH) throw new SalesFailure("SALES_FINANCED_SALE_INVALID", `Between 1 and ${MAX_BATCH} sales are required.`);
    const state = await this.repository.load(companyId);
    const rateOn = await this.rateResolver(sales.filter((sale) => !sale.vesPerUsd).map((sale) => salesDate(sale.saleDate)));
    const records = sales.map((sale): FinancedSaleRecord => {
      const date = salesDate(sale.saleDate);
      const manualRate = sale.vesPerUsd ? positiveDecimal(sale.vesPerUsd, "SALES_FINANCED_SALE_INVALID") : null;
      const rate = manualRate ?? rateOn(date);
      if (!rate) throw new SalesFailure("SALES_FINANCED_SALE_INVALID", `No official rate is available for ${date}.`);
      return {
        id: this.newId(),
        saleDate: date,
        amountVes: positiveDecimal(sale.amountVes, "SALES_FINANCED_SALE_INVALID"),
        upfrontPercent: sale.upfrontPercent ? exactDecimal(sale.upfrontPercent) : state.settings.upfrontPercent,
        vesPerUsd: rate,
        rateSource: manualRate ? "manual" : "bcv",
        note: sale.note?.trim() || null,
      };
    });
    // Validates every new record before persisting any of them.
    this.calculate({ ...state, sales: [...state.sales, ...records] });
    await this.repository.addSales(companyId, records);
    return this.afterChange(companyId);
  }

  /**
   * Records deposits and re-synchronizes the journal.
   * @param companyId - Company that owns the ledger.
   * @param deposits - Up to 1000 new deposits.
   * @returns The recalculated view and synchronization result.
   * @throws {SalesFailure} `SALES_FINANCED_COLLECTION_INVALID` for invalid input or a date
   * without official rate, or `SALES_REPOSITORY_UNAVAILABLE` when storage or rates fail.
   */
  async addDeposits(companyId: string, deposits: readonly NewFinancierDeposit[]): Promise<FinancedSalesLedgerChange> {
    if (!deposits.length || deposits.length > MAX_BATCH) throw new SalesFailure("SALES_FINANCED_COLLECTION_INVALID", `Between 1 and ${MAX_BATCH} deposits are required.`);
    const state = await this.repository.load(companyId);
    const rateOn = await this.rateResolver(deposits.filter((deposit) => !deposit.vesPerUsd).map((deposit) => salesDate(deposit.depositDate)));
    const records = deposits.map((deposit): FinancierDepositRecord => {
      const date = salesDate(deposit.depositDate);
      const manualRate = deposit.vesPerUsd ? positiveDecimal(deposit.vesPerUsd, "SALES_FINANCED_COLLECTION_INVALID") : null;
      const rate = manualRate ?? rateOn(date);
      if (!rate) throw new SalesFailure("SALES_FINANCED_COLLECTION_INVALID", `No official rate is available for ${date}.`);
      return {
        id: this.newId(),
        depositDate: date,
        amountVes: positiveDecimal(deposit.amountVes, "SALES_FINANCED_COLLECTION_INVALID"),
        vesPerUsd: rate,
        rateSource: manualRate ? "manual" : "bcv",
        commissionPercent: deposit.commissionPercent ? exactDecimal(deposit.commissionPercent) : state.settings.commissionPercent,
        reference: deposit.reference?.trim() || null,
        bankEntryId: deposit.bankEntryId?.trim() || null,
      };
    });
    this.calculate({ ...state, deposits: [...state.deposits, ...records] });
    await this.repository.addDeposits(companyId, records);
    return this.afterChange(companyId);
  }

  /**
   * Deletes a sale or deposit and re-synchronizes the journal.
   * @param companyId - Company that owns the ledger.
   * @param kind - Record kind.
   * @param id - Record identifier.
   * @returns The recalculated view and synchronization result.
   * @throws {SalesFailure} `SALES_REPOSITORY_UNAVAILABLE` when storage fails.
   */
  async remove(companyId: string, kind: "sale" | "deposit", id: string): Promise<FinancedSalesLedgerChange> {
    await this.repository.remove(companyId, kind, id);
    return this.afterChange(companyId);
  }

  /**
   * Saves settings and re-synchronizes the journal with the new accounts or granularity.
   * @param companyId - Company that owns the ledger.
   * @param settings - New settings.
   * @param expectedVersion - Version the caller read.
   * @returns The recalculated view and synchronization result.
   * @throws {SalesFailure} `SALES_FINANCED_SALE_INVALID` for invalid percentages or
   * `SALES_CONCURRENCY_CONFLICT` when the settings changed meanwhile.
   */
  async saveSettings(companyId: string, settings: FinancedSalesLedgerSettings, expectedVersion: number): Promise<FinancedSalesLedgerChange> {
    for (const value of [settings.upfrontPercent, settings.commissionPercent]) {
      const percent = exactDecimal(value);
      if (compareDecimal(percent, exactDecimal("0")) < 0 || compareDecimal(percent, exactDecimal("100")) >= 0) {
        throw new SalesFailure("SALES_FINANCED_SALE_INVALID", "Percentages must be at least 0 and below 100.");
      }
    }
    if (!settings.financierName.trim() || settings.financierName.trim().length > 80) throw new SalesFailure("SALES_FINANCED_SALE_INVALID", "Financier name is invalid.");
    await this.repository.saveSettings(companyId, { ...settings, financierName: settings.financierName.trim() }, expectedVersion);
    return this.afterChange(companyId);
  }

  /**
   * Links deposits to Treasury bank movements, or unlinks them with `null`.
   * Links do not change amounts, so the journal is not re-synchronized.
   * @param companyId - Company that owns the ledger.
   * @param links - Up to 1000 deposit links.
   * @returns The recalculated view.
   * @throws {SalesFailure} `SALES_FINANCED_COLLECTION_INVALID` for unknown deposits or
   * repeated bank entries, or `SALES_CONCURRENCY_CONFLICT` when an entry is linked elsewhere.
   */
  async linkBankEntries(companyId: string, links: readonly { readonly depositId: string; readonly bankEntryId: string | null }[]): Promise<FinancedSalesLedgerView> {
    if (!links.length || links.length > MAX_BATCH) throw new SalesFailure("SALES_FINANCED_COLLECTION_INVALID", `Between 1 and ${MAX_BATCH} links are required.`);
    const state = await this.repository.load(companyId);
    const known = new Set(state.deposits.map((deposit) => deposit.id));
    const entries = links.flatMap((link) => link.bankEntryId ? [link.bankEntryId] : []);
    if (links.some((link) => !known.has(link.depositId)) || new Set(entries).size !== entries.length) {
      throw new SalesFailure("SALES_FINANCED_COLLECTION_INVALID", "Deposit links reference unknown deposits or repeat a bank entry.");
    }
    await this.repository.setBankLinks(companyId, links);
    return this.view(companyId);
  }

  /**
   * Re-synchronizes the journal without changing the ledger.
   * @param companyId - Company that owns the ledger.
   * @returns The current view and synchronization result.
   * @throws {SalesFailure} `SALES_REPOSITORY_UNAVAILABLE` when storage fails.
   */
  async resync(companyId: string): Promise<FinancedSalesLedgerChange> {
    return this.afterChange(companyId);
  }

  private async afterChange(companyId: string): Promise<FinancedSalesLedgerChange> {
    const view = await this.view(companyId);
    const missing = REQUIRED_ROLES.some((role) => !view.settings.accounts[role])
      || (compareDecimal(view.totals.commissionVes, exactDecimal("0")) > 0 && !view.settings.accounts.financier_commission);
    const journalSync = missing
      ? { status: "skipped_missing_accounts" as const, created: 0, updated: 0, removed: 0, alreadyPosted: 0, monthsWithoutPeriod: [] }
      : await this.journal.sync(companyId, view.journal, view.settings.journalGranularity, view.settings.accounts);
    return { view, journalSync };
  }

  private calculate(state: FinancedSalesLedgerState): FinancedSalesLedgerView {
    const terms = state.sales.map((sale): FinancedSaleTerms => ({
      reference: `${sale.saleDate} · ${sale.id.slice(0, 8)}`,
      saleDate: sale.saleDate,
      saleAmountVes: sale.amountVes,
      upfrontPercent: sale.upfrontPercent,
      saleVesPerUsd: sale.vesPerUsd,
    }));
    const allocation = allocateFinancierDeposits(terms, state.deposits.map((deposit) => ({
      reference: deposit.id,
      depositDate: deposit.depositDate,
      amountVes: deposit.amountVes,
      vesPerUsd: deposit.vesPerUsd,
      commissionPercent: deposit.commissionPercent,
    })));
    const sales = state.sales.map((record, index) => {
      const allocated = allocation.sales[index]!;
      const row: FinancedSaleReportRow = {
        status: "calculated",
        line: { reference: allocated.settlement.terms.reference, saleDate: record.saleDate, saleAmountVes: record.amountVes },
        settlement: allocated.settlement,
        saleRateSource: record.rateSource === "manual" ? "override" : "official",
        collectionMode: allocated.settlement.collections.length ? "actual" : "pending",
      };
      return { record, row, depositIds: allocated.depositReferences };
    });
    return {
      settings: state.settings,
      sales,
      deposits: state.deposits,
      unapplied: allocation.unapplied,
      journal: buildFinancedSalesJournal(sales.map((sale) => sale.row), { granularity: state.settings.journalGranularity, includeEstimated: false, describeMonth: this.describeMonth }),
      revaluations: [],
      revaluationError: null,
      ...summarizeFinancedSaleSettlements(allocation.sales.map((sale) => sale.settlement)),
    };
  }

  // Revaluation needs month-end rates, so it runs only for views returned to callers.
  private async withRevaluation(view: FinancedSalesLedgerView): Promise<FinancedSalesLedgerView> {
    const first = view.sales.map((sale) => sale.record.saleDate).sort()[0];
    if (!view.settings.revalueMonthEnd || !first) return view;
    const asOf = this.today();
    const monthEnds = completedMonthEnds(first, asOf);
    if (!monthEnds.length) return view;
    let rates: MonthEndRate[];
    try {
      const rateOn = await this.rateResolver(monthEnds.map((item) => item.date));
      rates = monthEnds.map((item) => {
        const rate = rateOn(item.date);
        if (!rate) throw new SalesFailure("SALES_FINANCED_SALE_INVALID", `No official rate is available for ${item.date}.`);
        return { ...item, vesPerUsd: rate };
      });
    } catch (error) {
      return { ...view, revaluationError: error instanceof Error ? error.message : "Official exchange rates are unavailable." };
    }
    const settlements = view.sales.flatMap((sale) => sale.row.status === "calculated" ? [sale.row.settlement] : []);
    const revaluations = revalueFinancedSalesAtMonthEnds(settlements, rates);
    const revaluationEntries = financedSaleRevaluationJournalEntries(revaluations, asOf, (kind, month) => this.describeMonth(kind, month));
    return { ...view, revaluations, journal: [...view.journal, ...revaluationEntries].sort(compareFinancedSaleJournalEntries) };
  }

  private async rateResolver(dates: readonly SalesDate[]): Promise<(date: SalesDate) => ExactDecimal | null> {
    if (!dates.length) return () => null;
    const sorted = [...dates].sort();
    const start = new Date(`${sorted[0]}T00:00:00Z`);
    // Covers weekends and holidays before the first date, when BCV does not publish.
    start.setUTCDate(start.getUTCDate() - 10);
    let points;
    try {
      points = await this.rates.ratesBetween(salesDate(start.toISOString().slice(0, 10)), sorted[sorted.length - 1]!);
    } catch (cause) {
      throw new SalesFailure("SALES_REPOSITORY_UNAVAILABLE", "Official exchange rates are unavailable.", { cause });
    }
    const ordered = [...points].sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate));
    return (date) => {
      let found: ExactDecimal | null = null;
      for (const point of ordered) {
        if (point.effectiveDate > date) break;
        found = point.vesPerUsd;
      }
      return found;
    };
  }
}

function positiveDecimal(value: string, code: "SALES_FINANCED_SALE_INVALID" | "SALES_FINANCED_COLLECTION_INVALID"): ExactDecimal {
  let decimal: ExactDecimal;
  try { decimal = exactDecimal(value); } catch (cause) { throw new SalesFailure(code, "Amount is not a decimal value.", { cause }); }
  if (compareDecimal(decimal, exactDecimal("0")) <= 0) throw new SalesFailure(code, "Amount must be positive.");
  return decimal;
}
