import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import { financedSaleJournalEntries, salesDate, settleFinancedSale } from "@kontave/sales/domain";
import type { AccountingPeriod } from "../src/modules/accounting/backend/domain/accounting-period";
import type { JournalEntry } from "../src/modules/accounting/backend/domain/journal-entry";
import { planFinancedSalesJournalPublication } from "../src/modules/sales/frontend/financed-sales/financed-sales-journal-publication";

const entries = financedSaleJournalEntries(settleFinancedSale({
    reference: "2025-10-01",
    saleDate: salesDate("2025-10-01"),
    saleAmountVes: exactDecimal("7455.25"),
    upfrontPercent: exactDecimal("60"),
    saleVesPerUsd: exactDecimal("179.43"),
}, [{ collectedOn: salesDate("2025-11-20"), receivedVes: exactDecimal("3992.47") }]));

const accounts = { bank: "a-bank", financier_receivable: "a-cxc", sales: "a-sales", exchange_gain: "a-fx", exchange_loss: "a-fx" };

function period(id: string, startDate: string, endDate: string, status: AccountingPeriod["status"] = "open"): AccountingPeriod {
    return { id, companyId: "J-1", name: id, startDate, endDate, status, closedAt: null, createdAt: "", updatedAt: "" };
}

function journal(id: string, sourceRef: string, status: JournalEntry["status"]): JournalEntry {
    return { id, companyId: "J-1", periodId: "p", entryNumber: 1, date: "2025-10-01", description: "", status, source: "manual", sourceRef, postedAt: null, createdAt: "", updatedAt: "" };
}

test("creates new drafts in the open period that contains each entry date", () => {
    const plan = planFinancedSalesJournalPublication(entries, "daily", accounts, [period("oct", "2025-10-01", "2025-10-31"), period("nov", "2025-11-01", "2025-11-30")], []);
    assert.deepEqual(plan.items.map((item) => [item.sourceRef, item.action]), [
        ["financed-sales:daily:sale:2025-10-01", { kind: "create", periodId: "oct" }],
        ["financed-sales:daily:collection:2025-10-01:2025-11-20:1", { kind: "create", periodId: "nov" }],
    ]);
    assert.deepEqual(plan.missingRoles, []);
    assert.equal(plan.conflictingEntries, 0);
});

test("updates its own drafts, never touches posted entries and reports closed periods", () => {
    const plan = planFinancedSalesJournalPublication(entries, "daily", accounts, [period("oct", "2025-10-01", "2025-10-31"), period("nov", "2025-11-01", "2025-11-30", "closed")], [
        journal("e-1", "financed-sales:daily:sale:2025-10-01", "draft"),
    ]);
    assert.deepEqual(plan.items.map((item) => item.action), [{ kind: "update", periodId: "oct", entryId: "e-1" }, { kind: "no_open_period" }]);

    const posted = planFinancedSalesJournalPublication(entries, "daily", accounts, [period("oct", "2025-10-01", "2025-10-31")], [
        journal("e-1", "financed-sales:daily:sale:2025-10-01", "posted"),
    ]);
    assert.deepEqual(posted.items[0]?.action, { kind: "already_posted", entryId: "e-1" });
});

test("blocks on unassigned roles and on entries published with the other granularity", () => {
    const plan = planFinancedSalesJournalPublication(entries, "daily", { bank: "a-bank" }, [], [
        journal("e-9", "financed-sales:monthly:sale:2025-10", "draft"),
        journal("e-10", "payroll:run-1", "draft"),
    ]);
    assert.deepEqual(plan.missingRoles.sort(), ["exchange_gain", "financier_receivable", "sales"]);
    assert.equal(plan.conflictingEntries, 1);
});
