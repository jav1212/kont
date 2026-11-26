"use client";

// Page shell for exchange differences: the persisted Cashea ledger, the
// spreadsheet calculator and foreign currency collected at the counter.

import { useState } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { ForeignCurrencyCollectionsScreen } from "../foreign-currency-collections/foreign-currency-collections-screen";
import { FinancedSalesExchangeDifferenceScreen } from "./financed-sales-exchange-difference-screen";
import { FinancedSalesLedgerScreen } from "./financed-sales-ledger-screen";

const TABS = [
    { id: "ledger", label: "Libro Cashea", subtitle: "Ventas financiadas (Cashea) · cobro diferido a tasa BCV" },
    { id: "calculator", label: "Calculadora (Excel)", subtitle: "Ventas financiadas (Cashea) · cobro diferido a tasa BCV" },
    { id: "foreign-currency", label: "Cobros en divisas", subtitle: "Divisas cobradas · valoradas a la tasa BCV de la fecha de pago" },
] as const;

export function FinancedSalesPage() {
    const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("ledger");
    const current = TABS.find((item) => item.id === tab) ?? TABS[0];
    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Diferencial cambiario" subtitle={current.subtitle}>
                <div role="tablist" className="inline-flex rounded-lg border border-border-light overflow-hidden">
                    {TABS.map((item, index) => (
                        <button key={item.id} role="tab" type="button" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
                            className={["px-3 h-8 text-[11px] uppercase tracking-[0.12em]", index > 0 ? "border-l border-border-light" : "", tab === item.id ? "bg-primary-500/10 text-primary-500 font-bold" : "text-[var(--text-secondary)] hover:bg-surface-2"].join(" ")}>
                            {item.label}
                        </button>
                    ))}
                </div>
            </PageHeader>
            {tab === "ledger" ? <FinancedSalesLedgerScreen /> : tab === "calculator" ? <FinancedSalesExchangeDifferenceScreen /> : <ForeignCurrencyCollectionsScreen />}
        </div>
    );
}
