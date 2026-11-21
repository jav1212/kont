import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import {
  DEFAULT_FINANCED_SALES_LEDGER_SETTINGS,
  FinancedSalesLedger,
  type FinancedSalesJournalSink,
  type FinancedSalesLedgerRepository,
  type FinancedSalesLedgerSettings,
  type FinancedSalesLedgerState,
  type UsdVesRateHistory,
} from "../../src/application";
import { SalesFailure, salesDate, type FinancedSaleJournalEntry } from "../../src/domain";

const accounts = { bank: "bank", financier_receivable: "cxc", sales: "sales", exchange_gain: "fx", exchange_loss: "fx" };

class MemoryRepository implements FinancedSalesLedgerRepository {
  state: FinancedSalesLedgerState = { settings: DEFAULT_FINANCED_SALES_LEDGER_SETTINGS, sales: [], deposits: [] };
  async load() { return this.state; }
  async saveSettings(_companyId: string, settings: FinancedSalesLedgerSettings, expectedVersion: number) {
    if (expectedVersion !== this.state.settings.version) throw new SalesFailure("SALES_CONCURRENCY_CONFLICT", "stale");
    this.state = { ...this.state, settings: { ...settings, version: expectedVersion + 1 } };
    return this.state.settings;
  }
  async addSales(_companyId: string, sales: FinancedSalesLedgerState["sales"]) { this.state = { ...this.state, sales: [...this.state.sales, ...sales] }; }
  async addDeposits(_companyId: string, deposits: FinancedSalesLedgerState["deposits"]) { this.state = { ...this.state, deposits: [...this.state.deposits, ...deposits] }; }
  async setBankLinks(_companyId: string, links: readonly { depositId: string; bankEntryId: string | null }[]) {
    const byId = new Map(links.map((link) => [link.depositId, link.bankEntryId]));
    this.state = { ...this.state, deposits: this.state.deposits.map((deposit) => byId.has(deposit.id) ? { ...deposit, bankEntryId: byId.get(deposit.id)! } : deposit) };
  }
  async updateSale(_companyId: string, sale: FinancedSalesLedgerState["sales"][number]) {
    if (!this.state.sales.some((candidate) => candidate.id === sale.id)) throw new SalesFailure("SALES_NOT_FOUND", "missing");
    this.state = { ...this.state, sales: this.state.sales.map((candidate) => candidate.id === sale.id ? sale : candidate) };
  }
  async updateDeposit(_companyId: string, deposit: FinancedSalesLedgerState["deposits"][number]) {
    if (!this.state.deposits.some((candidate) => candidate.id === deposit.id)) throw new SalesFailure("SALES_NOT_FOUND", "missing");
    this.state = { ...this.state, deposits: this.state.deposits.map((candidate) => candidate.id === deposit.id ? deposit : candidate) };
  }
  async remove(_companyId: string, kind: "sale" | "deposit", id: string) {
    this.state = kind === "sale" ? { ...this.state, sales: this.state.sales.filter((sale) => sale.id !== id) } : { ...this.state, deposits: this.state.deposits.filter((deposit) => deposit.id !== id) };
  }
}

const rates: UsdVesRateHistory = {
  async ratesBetween() {
    return [["2025-09-30", "177.6143"], ["2025-10-01", "179.43"], ["2025-10-31", "220"], ["2025-11-20", "240.22296107"]].map(([date, rate]) => ({ effectiveDate: salesDate(date!), vesPerUsd: exactDecimal(rate!) }));
  },
};

function setup() {
  const repository = new MemoryRepository();
  const synced: Array<readonly FinancedSaleJournalEntry[]> = [];
  const sink: FinancedSalesJournalSink = {
    async sync(_companyId, entries) {
      synced.push(entries);
      return { status: "synced", created: entries.length, updated: 0, removed: 0, alreadyPosted: 0, monthsWithoutPeriod: [] };
    },
  };
  let next = 0;
  const ledger = new FinancedSalesLedger(repository, rates, sink, () => `id-${String(++next).padStart(8, "0")}`, (kind, month) => `${kind} ${month}`, () => salesDate("2025-11-25"));
  return { ledger, repository, synced };
}

test("records a sale at the official rate of its date and a deposit that realizes the difference", async () => {
  const { ledger, repository, synced } = setup();
  await ledger.saveSettings("J-1", { ...DEFAULT_FINANCED_SALES_LEDGER_SETTINGS, accounts }, 0);
  await ledger.addSales("J-1", [{ saleDate: "2025-10-01", amountVes: "7455.25" }]);
  assert.equal(repository.state.sales[0]?.vesPerUsd, "179.43");
  assert.equal(repository.state.sales[0]?.rateSource, "bcv");

  const change = await ledger.addDeposits("J-1", [{ depositDate: "2025-11-20", amountVes: "3992.47" }]);
  assert.equal(change.view.totals.realizedGainVes, "1010.37");
  assert.deepEqual(change.view.sales[0]?.depositIds, ["id-00000002"]);
  assert.equal(change.journalSync.status, "synced");
  assert.deepEqual(synced.at(-1)?.map((entry) => entry.key), ["sale:2025-10", "collection:2025-11"]);
});

test("skips accounting until every required account is assigned", async () => {
  const { ledger, synced } = setup();
  const change = await ledger.addSales("J-1", [{ saleDate: "2025-10-01", amountVes: "100", vesPerUsd: "200" }]);
  assert.equal(change.journalSync.status, "skipped_missing_accounts");
  assert.equal(change.view.sales[0]?.record.rateSource, "manual");
  assert.equal(synced.length, 0);
});

test("rejects a whole batch when one record is invalid, and resyncs after deletions", async () => {
  const { ledger, repository } = setup();
  await assert.rejects(ledger.addSales("J-1", [{ saleDate: "2025-10-01", amountVes: "100" }, { saleDate: "2025-10-01", amountVes: "-1" }]), SalesFailure);
  assert.equal(repository.state.sales.length, 0);
  await assert.rejects(ledger.addSales("J-1", [{ saleDate: "2025-01-01", amountVes: "100" }]), (error) => error instanceof SalesFailure && error.code === "SALES_FINANCED_SALE_INVALID");

  await ledger.addSales("J-1", [{ saleDate: "2025-10-01", amountVes: "100" }]);
  const change = await ledger.remove("J-1", "sale", repository.state.sales[0]!.id);
  assert.equal(change.view.sales.length, 0);
});

test("rejects stale settings", async () => {
  const { ledger } = setup();
  await ledger.saveSettings("J-1", DEFAULT_FINANCED_SALES_LEDGER_SETTINGS, 0);
  await assert.rejects(ledger.saveSettings("J-1", DEFAULT_FINANCED_SALES_LEDGER_SETTINGS, 0), (error) => error instanceof SalesFailure && error.code === "SALES_CONCURRENCY_CONFLICT");
});

test("adds month-end revaluation and its reversal to the journal when enabled", async () => {
  const { ledger, synced } = setup();
  await ledger.saveSettings("J-1", { ...DEFAULT_FINANCED_SALES_LEDGER_SETTINGS, accounts, revalueMonthEnd: true }, 0);
  const pending = await ledger.addSales("J-1", [{ saleDate: "2025-10-01", amountVes: "7455.25" }]);
  assert.equal(pending.view.revaluations[0]?.difference, "674.27");
  assert.equal(pending.view.revaluationError, null);
  assert.equal(pending.journalSync.status, "skipped_missing_accounts", "unrealized accounts are required once revaluation entries exist");

  const change = await ledger.saveSettings("J-1", { ...DEFAULT_FINANCED_SALES_LEDGER_SETTINGS, accounts: { ...accounts, unrealized_exchange_gain: "fx-u", unrealized_exchange_loss: "fx-u" }, revalueMonthEnd: true }, 1);
  assert.equal(change.journalSync.status, "synced");
  assert.deepEqual(synced.at(-1)?.map((entry) => entry.key), ["sale:2025-10", "revaluation:2025-10", "revaluation_reversal:2025-10"]);
  assert.deepEqual(synced.at(-1)?.[1]?.lines.map((line) => line.role), ["financier_receivable", "unrealized_exchange_gain"]);
});

test("links deposits to bank movements and rejects repeated entries", async () => {
  const { ledger, repository } = setup();
  await ledger.addSales("J-1", [{ saleDate: "2025-10-01", amountVes: "7455.25" }]);
  await ledger.addDeposits("J-1", [{ depositDate: "2025-11-20", amountVes: "1000" }, { depositDate: "2025-11-20", amountVes: "2992.47", bankEntryId: "bank-2" }]);
  const [first, second] = repository.state.deposits;
  assert.equal(second?.bankEntryId, "bank-2");
  const view = await ledger.linkBankEntries("J-1", [{ depositId: first!.id, bankEntryId: "bank-1" }]);
  assert.deepEqual(view.deposits.map((deposit) => deposit.bankEntryId), ["bank-1", "bank-2"]);
  await assert.rejects(ledger.linkBankEntries("J-1", [{ depositId: first!.id, bankEntryId: "x" }, { depositId: second!.id, bankEntryId: "x" }]), SalesFailure);
  await assert.rejects(ledger.linkBankEntries("J-1", [{ depositId: "missing", bankEntryId: "y" }]), SalesFailure);
});

test("edits a sale and a deposit, re-resolving rates and keeping the bank link", async () => {
  const { ledger, repository, synced } = setup();
  await ledger.saveSettings("J-1", { ...DEFAULT_FINANCED_SALES_LEDGER_SETTINGS, accounts }, 0);
  await ledger.addSales("J-1", [{ saleDate: "2025-10-01", amountVes: "1000", vesPerUsd: "100", note: "nota" }]);
  await ledger.addDeposits("J-1", [{ depositDate: "2025-11-20", amountVes: "500", bankEntryId: "bank-1", reference: "ref" }]);
  const sale = repository.state.sales[0]!;
  const deposit = repository.state.deposits[0]!;

  const changed = await ledger.updateSale("J-1", sale.id, { saleDate: "2025-10-01", amountVes: "7455.25" });
  assert.equal(repository.state.sales[0]?.amountVes, "7455.25");
  assert.equal(repository.state.sales[0]?.vesPerUsd, "179.43", "an omitted rate is resolved again from BCV");
  assert.equal(repository.state.sales[0]?.rateSource, "bcv");
  assert.equal(repository.state.sales[0]?.note, "nota", "an omitted note is kept");
  assert.equal(changed.journalSync.status, "synced");

  await ledger.updateDeposit("J-1", deposit.id, { depositDate: "2025-11-20", amountVes: "3992.47" });
  assert.equal(repository.state.deposits[0]?.bankEntryId, "bank-1");
  assert.equal(repository.state.deposits[0]?.reference, "ref");
  assert.equal((await ledger.view("J-1")).totals.realizedGainVes, "1010.37");
  assert.ok(synced.length >= 3);

  await assert.rejects(ledger.updateSale("J-1", "missing", { saleDate: "2025-10-01", amountVes: "1" }), (error) => error instanceof SalesFailure && error.code === "SALES_NOT_FOUND");
  await assert.rejects(ledger.updateDeposit("J-1", deposit.id, { depositDate: "2025-11-20", amountVes: "0" }), (error) => error instanceof SalesFailure && error.code === "SALES_FINANCED_COLLECTION_INVALID");
});
