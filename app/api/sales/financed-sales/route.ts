import { decimalToFixed, type ExactDecimal } from "@kontave/monetary/domain";
import {
    type FinancedSaleRoleAccounts,
    type FinancedSalesLedgerChange,
    type FinancedSalesLedgerView,
} from "@kontave/sales/application";
import { SalesFailure, type FinancedSaleAccountRole } from "@kontave/sales/domain";
import { withTenantPermission } from "@/src/shared/backend/utils/require-tenant";
import { getFinancedSalesLedger } from "@/src/modules/sales/backend/infra/financed-sales/financed-sales-ledger-factory";

const ROLES: readonly FinancedSaleAccountRole[] = ["bank", "financier_receivable", "sales", "exchange_gain", "exchange_loss", "financier_commission"];

/** Returns the calculated financed-sales ledger of a company. */
export const GET = withTenantPermission("sales.read", async (req, { tenantId, userId }) => {
    const companyId = new URL(req.url).searchParams.get("companyId");
    if (!companyId) return Response.json({ error: "companyId es requerido" }, { status: 400 });
    try {
        return Response.json({ data: { view: serializeView(await getFinancedSalesLedger(tenantId, userId).view(companyId)) } });
    } catch (error) {
        return failureResponse(error);
    }
});

/**
 * Applies one ledger command and re-synchronizes its draft journal.
 * Body: `{ companyId, action, ... }` with action `add_sales`, `add_deposits`,
 * `remove`, `save_settings`, `link_bank_entries` or `resync`.
 */
export const POST = withTenantPermission("sales.create", async (req, { tenantId, userId }) => {
    try {
        const body = await req.json() as Record<string, unknown>;
        const companyId = typeof body.companyId === "string" ? body.companyId : "";
        if (!companyId) return Response.json({ error: "companyId es requerido" }, { status: 400 });
        const ledger = getFinancedSalesLedger(tenantId, userId);
        let change: FinancedSalesLedgerChange;
        switch (body.action) {
            case "add_sales":
                change = await ledger.addSales(companyId, records(body.sales).map((sale) => ({
                    saleDate: text(sale.saleDate),
                    amountVes: decimalText(sale.amountVes),
                    ...(sale.upfrontPercent != null && sale.upfrontPercent !== "" ? { upfrontPercent: decimalText(sale.upfrontPercent) } : {}),
                    ...(sale.vesPerUsd != null && sale.vesPerUsd !== "" ? { vesPerUsd: decimalText(sale.vesPerUsd) } : {}),
                    note: typeof sale.note === "string" ? sale.note : null,
                })));
                break;
            case "add_deposits":
                change = await ledger.addDeposits(companyId, records(body.deposits).map((deposit) => ({
                    depositDate: text(deposit.depositDate),
                    amountVes: decimalText(deposit.amountVes),
                    ...(deposit.commissionPercent != null && deposit.commissionPercent !== "" ? { commissionPercent: decimalText(deposit.commissionPercent) } : {}),
                    ...(deposit.vesPerUsd != null && deposit.vesPerUsd !== "" ? { vesPerUsd: decimalText(deposit.vesPerUsd) } : {}),
                    reference: typeof deposit.reference === "string" ? deposit.reference : null,
                    bankEntryId: typeof deposit.bankEntryId === "string" ? deposit.bankEntryId : null,
                })));
                break;
            case "link_bank_entries": {
                const view = await ledger.linkBankEntries(companyId, records(body.links).map((link) => ({
                    depositId: text(link.depositId),
                    bankEntryId: typeof link.bankEntryId === "string" && link.bankEntryId ? link.bankEntryId : null,
                })));
                return Response.json({ data: { view: serializeView(view), journalSync: null } });
            }
            case "remove":
                if ((body.kind !== "sale" && body.kind !== "deposit") || typeof body.id !== "string") return Response.json({ error: "Registro inválido" }, { status: 400 });
                change = await ledger.remove(companyId, body.kind, body.id);
                break;
            case "save_settings": {
                const settings = (body.settings ?? {}) as Record<string, unknown>;
                const accounts: FinancedSaleRoleAccounts = {};
                const rawAccounts = (settings.accounts ?? {}) as Record<string, unknown>;
                for (const role of ROLES) if (typeof rawAccounts[role] === "string" && rawAccounts[role]) accounts[role] = rawAccounts[role] as string;
                change = await ledger.saveSettings(companyId, {
                    financierName: text(settings.financierName),
                    upfrontPercent: decimalText(settings.upfrontPercent) as ExactDecimal,
                    commissionPercent: decimalText(settings.commissionPercent) as ExactDecimal,
                    journalGranularity: settings.journalGranularity === "daily" ? "daily" : "monthly",
                    revalueMonthEnd: settings.revalueMonthEnd === true,
                    accounts,
                    version: 0,
                }, Number(body.expectedVersion ?? 0));
                break;
            }
            case "resync":
                change = await ledger.resync(companyId);
                break;
            default:
                return Response.json({ error: "Acción no soportada" }, { status: 400 });
        }
        return Response.json({ data: { view: serializeView(change.view), journalSync: change.journalSync } });
    } catch (error) {
        return failureResponse(error);
    }
});

/** Converts exact decimals to fixed text so the client never sees binary floats. */
function serializeView(view: FinancedSalesLedgerView) {
    const fixed = (value: ExactDecimal, scale = 2) => decimalToFixed(value, scale);
    const totals = (item: FinancedSalesLedgerView["totals"]) => ({
        saleAmountVes: fixed(item.saleAmountVes),
        upfrontVes: fixed(item.upfrontVes),
        financedVes: fixed(item.financedVes),
        collectedVes: fixed(item.collectedVes),
        commissionVes: fixed(item.commissionVes),
        realizedGainVes: fixed(item.realizedGainVes),
        realizedLossVes: fixed(item.realizedLossVes),
        outstandingCarriedVes: fixed(item.outstandingCarriedVes),
    });
    return {
        settings: view.settings,
        sales: view.sales.map(({ record, row, depositIds }) => {
            const settlement = row.status === "calculated" ? row.settlement : null;
            return {
                id: record.id,
                saleDate: record.saleDate,
                amountVes: fixed(record.amountVes),
                upfrontPercent: record.upfrontPercent,
                vesPerUsd: fixed(record.vesPerUsd, 4),
                rateSource: record.rateSource,
                note: record.note,
                upfrontVes: settlement ? fixed(settlement.upfrontVes) : null,
                financedVes: settlement ? fixed(settlement.financedVes) : null,
                financedUsd: settlement ? fixed(settlement.financedUsd, 4) : null,
                collectedVes: settlement ? fixed(settlement.collections.reduce((sum, item) => sum + Number(item.receivedVes), 0).toFixed(2) as ExactDecimal) : null,
                exchangeDifference: settlement ? fixed(settlement.exchangeDifference) : null,
                outstandingUsd: settlement ? fixed(settlement.outstandingUsd, 4) : null,
                outstandingCarriedVes: settlement ? fixed(settlement.outstandingCarriedVes) : null,
                lastCollectedOn: settlement?.collections.at(-1)?.collectedOn ?? null,
                depositIds,
            };
        }),
        deposits: view.deposits.map((deposit) => ({
            id: deposit.id,
            depositDate: deposit.depositDate,
            amountVes: fixed(deposit.amountVes),
            vesPerUsd: fixed(deposit.vesPerUsd, 4),
            rateSource: deposit.rateSource,
            commissionPercent: deposit.commissionPercent,
            reference: deposit.reference,
            bankEntryId: deposit.bankEntryId,
        })),
        unapplied: view.unapplied.map((item) => ({ depositId: item.deposit.reference, unappliedUsd: fixed(item.unappliedUsd, 4), unappliedVes: fixed(item.unappliedVes) })),
        revaluations: view.revaluations.map((item) => ({
            month: item.month,
            date: item.date,
            vesPerUsd: fixed(item.vesPerUsd, 4),
            outstandingUsd: fixed(item.outstandingUsd, 4),
            carriedVes: fixed(item.carriedVes),
            revaluedVes: fixed(item.revaluedVes),
            difference: fixed(item.difference),
        })),
        revaluationError: view.revaluationError,
        months: view.months.map((month) => ({ month: month.month, ...totals(month) })),
        totals: totals(view.totals),
        journal: view.journal.map((entry) => ({ ...entry, lines: entry.lines.map((line) => ({ role: line.role, debit: fixed(line.debit), credit: fixed(line.credit) })) })),
    };
}

function records(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) throw new SalesFailure("SALES_FINANCED_SALE_INVALID", "A list of records is required.");
    return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

function text(value: unknown): string {
    if (typeof value !== "string") throw new SalesFailure("SALES_FINANCED_SALE_INVALID", "A text value is required.");
    return value;
}

function decimalText(value: unknown): string {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && value.trim()) return value.trim().replace(",", ".");
    throw new SalesFailure("SALES_FINANCED_SALE_INVALID", "A decimal value is required.");
}

function failureResponse(error: unknown): Response {
    if (error instanceof SalesFailure) {
        const status = error.code === "SALES_NOT_FOUND" ? 404
            : error.code === "SALES_CONCURRENCY_CONFLICT" ? 409
            : error.code === "SALES_REPOSITORY_UNAVAILABLE" ? 503 : 400;
        return Response.json({ error: error.message, code: error.code }, { status });
    }
    return Response.json({ error: "No se pudo procesar el libro de ventas financiadas" }, { status: 500 });
}
