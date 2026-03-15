"use client";

import { useEffect, useState, useCallback } from "react";
import { useCapacity } from "@/src/modules/billing/frontend/hooks/use-capacity";

// ============================================================================
// TYPES
// ============================================================================

interface Plan {
    id:                     string;
    name:                   string;
    maxCompanies:           number | null;
    maxEmployeesPerCompany: number | null;
    priceMonthlyUsd:        number;
    priceQuarterlyUsd:      number | null;
    priceAnnualUsd:         number | null;
}

interface TenantData {
    id:                 string;
    status:             string;
    billingCycle:       string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd:   string | null;
    lastPaymentAt:      string | null;
    plan:               Plan | null;
}

interface PaymentRequest {
    id:             string;
    plan_id:        string;
    billing_cycle:  string;
    amount_usd:     number;
    payment_method: string;
    receipt_url:    string | null;
    status:         "pending" | "approved" | "rejected";
    submitted_at:   string;
    reviewed_at:    string | null;
    admin_note:     string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

const Spinner = () => (
    <svg className="animate-spin text-foreground/30" width="13" height="13" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

const STATUS_CLS: Record<string, string> = {
    active:    "border-green-500/20 bg-green-500/[0.08] text-green-600 dark:text-green-400",
    suspended: "border-red-500/20 bg-red-500/[0.08] text-red-600 dark:text-red-400",
    trial:     "border-amber-500/20 bg-amber-500/[0.08] text-amber-600 dark:text-amber-400",
    pending:   "border-amber-500/20 bg-amber-500/[0.08] text-amber-600 dark:text-amber-400",
    approved:  "border-green-500/20 bg-green-500/[0.08] text-green-600 dark:text-green-400",
    rejected:  "border-red-500/20 bg-red-500/[0.08] text-red-600 dark:text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
    active:    "Activo",
    suspended: "Suspendido",
    trial:     "Prueba",
    pending:   "Pendiente",
    approved:  "Aprobado",
    rejected:  "Rechazado",
};

const CYCLE_LABEL: Record<string, string> = {
    monthly:   "Mensual",
    quarterly: "Trimestral",
    annual:    "Anual",
};

function formatDate(iso?: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

function planPrice(plan: Plan, cycle: string): number {
    if (cycle === "quarterly" && plan.priceQuarterlyUsd) return plan.priceQuarterlyUsd;
    if (cycle === "annual"    && plan.priceAnnualUsd)    return plan.priceAnnualUsd;
    return plan.priceMonthlyUsd;
}

// ============================================================================
// PAGE
// ============================================================================

export default function BillingPage() {
    const { capacity } = useCapacity();

    // ── Data ──────────────────────────────────────────────────────────────
    const [tenant,   setTenant]   = useState<TenantData | null>(null);
    const [plans,    setPlans]    = useState<Plan[]>([]);
    const [history,  setHistory]  = useState<PaymentRequest[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);

    // ── Payment form ──────────────────────────────────────────────────────
    const [formOpen,     setFormOpen]     = useState(false);
    const [selPlanId,    setSelPlanId]    = useState("");
    const [selCycle,     setSelCycle]     = useState("monthly");
    const [payMethod,    setPayMethod]    = useState("transferencia");
    const [receiptUrl,   setReceiptUrl]   = useState("");
    const [submitting,   setSubmitting]   = useState(false);
    const [submitError,  setSubmitError]  = useState<string | null>(null);
    const [submitOk,     setSubmitOk]     = useState(false);

    // ── Load ──────────────────────────────────────────────────────────────
    const loadAll = useCallback(async () => {
        setLoading(true);
        setDataError(null);
        try {
            const [tenantRes, plansRes, histRes] = await Promise.all([
                fetch("/api/billing/tenant"),
                fetch("/api/billing/plans"),
                fetch("/api/billing/payment-requests"),
            ]);
            const [t, p, h] = await Promise.all([
                tenantRes.json(),
                plansRes.json(),
                histRes.json(),
            ]);
            if (t.data)  setTenant(t.data);
            if (p.data)  { setPlans(p.data); if (p.data.length > 0) setSelPlanId(p.data[0].id); }
            if (h.data)  setHistory(h.data);
        } catch {
            setDataError("Error al cargar los datos de facturación.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ── Submit payment request ─────────────────────────────────────────────
    const selectedPlan = plans.find((p) => p.id === selPlanId);
    const amount = selectedPlan ? planPrice(selectedPlan, selCycle) : 0;

    const handleSubmit = useCallback(async () => {
        if (!selPlanId) return;
        setSubmitting(true);
        setSubmitError(null);
        const res = await fetch("/api/billing/payment-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                planId:        selPlanId,
                billingCycle:  selCycle,
                amountUsd:     amount,
                paymentMethod: payMethod,
                receiptUrl:    receiptUrl.trim() || null,
            }),
        });
        const json = await res.json();
        setSubmitting(false);
        if (!res.ok) {
            setSubmitError(json.error ?? "Error al enviar solicitud.");
        } else {
            setSubmitOk(true);
            setFormOpen(false);
            setReceiptUrl("");
            await loadAll();
            setTimeout(() => setSubmitOk(false), 4000);
        }
    }, [selPlanId, selCycle, amount, payMethod, receiptUrl, loadAll]);

    // ── Render ─────────────────────────────────────────────────────────────

    const inputCls = [
        "w-full h-9 px-3 rounded-lg border bg-surface-1 outline-none",
        "font-mono text-[12px] text-foreground",
        "border-border-light focus:border-primary-500/60 hover:border-border-medium",
        "transition-colors duration-150 placeholder:text-foreground/25",
    ].join(" ");

    const selectCls = inputCls + " cursor-pointer";
    const labelCls = "font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/40 mb-1 block";

    return (
        <div className="min-h-full bg-surface-2 p-8 font-mono">
            <div className="max-w-[720px] mx-auto space-y-6">

                {/* Header */}
                <header className="pb-4 border-b border-border-light">
                    <nav className="font-mono text-[9px] uppercase tracking-[0.22em] text-foreground/30 mb-2">
                        Facturación
                    </nav>
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <h1 className="font-mono text-[22px] font-black uppercase tracking-tighter text-foreground leading-none">
                                Mi Plan
                            </h1>
                            <p className="font-mono text-[10px] text-foreground/35 mt-1.5 uppercase tracking-[0.18em]">
                                Suscripción y pagos
                            </p>
                        </div>
                        <button
                            onClick={() => { setFormOpen(true); setSubmitError(null); }}
                            disabled={formOpen}
                            className={[
                                "h-8 px-3 rounded-lg flex items-center gap-1.5 border",
                                "bg-primary-500 border-primary-600 text-white",
                                "hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed",
                                "font-mono text-[10px] uppercase tracking-[0.18em] transition-colors duration-150",
                            ].join(" ")}
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M6 1v10M1 6h10" />
                            </svg>
                            Enviar pago
                        </button>
                    </div>
                </header>

                {/* Success banner */}
                {submitOk && (
                    <div className="px-4 py-3 border border-green-500/20 rounded-xl bg-green-500/[0.05]">
                        <p className="font-mono text-[11px] text-green-500">
                            Solicitud enviada. Un administrador la revisará pronto.
                        </p>
                    </div>
                )}

                {dataError && (
                    <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/[0.05]">
                        <p className="font-mono text-[11px] text-red-500">{dataError}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center h-40 gap-2 border border-border-light rounded-xl">
                        <Spinner />
                        <span className="font-mono text-[11px] uppercase tracking-widest text-foreground/30">Cargando…</span>
                    </div>
                ) : (
                    <>
                        {/* Current plan card */}
                        <div className="border border-border-light rounded-xl bg-surface-1 divide-y divide-border-light/60">

                            {/* Plan info */}
                            <div className="px-5 py-4 flex items-start justify-between gap-4">
                                <div>
                                    <p className={labelCls}>Plan actual</p>
                                    <p className="font-mono text-[18px] font-bold text-foreground">
                                        {tenant?.plan?.name ?? "—"}
                                    </p>
                                    {tenant?.plan && (
                                        <p className="font-mono text-[11px] text-foreground/40 mt-0.5">
                                            ${tenant.plan.priceMonthlyUsd} USD / mes
                                        </p>
                                    )}
                                </div>
                                {tenant?.status && (
                                    <span className={[
                                        "h-6 px-2.5 rounded-md border font-mono text-[9px] uppercase tracking-[0.18em] flex items-center",
                                        STATUS_CLS[tenant.status] ?? "",
                                    ].join(" ")}>
                                        {STATUS_LABEL[tenant.status] ?? tenant.status}
                                    </span>
                                )}
                            </div>

                            {/* Period */}
                            <div className="px-5 py-3 grid grid-cols-3 gap-4">
                                <div>
                                    <p className={labelCls}>Ciclo</p>
                                    <p className="font-mono text-[12px] text-foreground">
                                        {CYCLE_LABEL[tenant?.billingCycle ?? ""] ?? tenant?.billingCycle ?? "—"}
                                    </p>
                                </div>
                                <div>
                                    <p className={labelCls}>Período inicio</p>
                                    <p className="font-mono text-[12px] text-foreground">
                                        {formatDate(tenant?.currentPeriodStart)}
                                    </p>
                                </div>
                                <div>
                                    <p className={labelCls}>Período fin</p>
                                    <p className="font-mono text-[12px] text-foreground">
                                        {formatDate(tenant?.currentPeriodEnd)}
                                    </p>
                                </div>
                            </div>

                            {/* Capacity */}
                            {capacity && (
                                <div className="px-5 py-3 grid grid-cols-2 gap-4">
                                    <div>
                                        <p className={labelCls}>Empresas</p>
                                        <div className="flex items-center gap-2">
                                            <p className="font-mono text-[12px] text-foreground">
                                                {capacity.companies.used}
                                                {capacity.companies.max !== null && ` / ${capacity.companies.max}`}
                                            </p>
                                            {capacity.companies.max !== null && (
                                                <div className="flex-1 h-1.5 rounded-full bg-foreground/[0.08] overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-primary-500/60"
                                                        style={{ width: `${Math.min(100, (capacity.companies.used / capacity.companies.max!) * 100)}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <p className={labelCls}>Empleados por empresa</p>
                                        <p className="font-mono text-[12px] text-foreground">
                                            {capacity.employeesPerCompany.max !== null
                                                ? `Máx. ${capacity.employeesPerCompany.max}`
                                                : "Ilimitados"}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Payment form */}
                        {formOpen && (
                            <div className="border border-primary-500/20 rounded-xl bg-surface-1 divide-y divide-border-light/60">
                                <div className="px-5 py-4 flex items-center justify-between">
                                    <h2 className="font-mono text-[12px] font-bold uppercase tracking-[0.15em] text-foreground">
                                        Nueva solicitud de pago
                                    </h2>
                                    <button
                                        onClick={() => setFormOpen(false)}
                                        className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/40 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                                    >
                                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M2 2l9 9M11 2l-9 9" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="px-5 py-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Plan */}
                                        <div>
                                            <label className={labelCls}>Plan</label>
                                            <select value={selPlanId} onChange={(e) => setSelPlanId(e.target.value)} className={selectCls}>
                                                {plans.map((p) => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Cycle */}
                                        <div>
                                            <label className={labelCls}>Ciclo de pago</label>
                                            <select value={selCycle} onChange={(e) => setSelCycle(e.target.value)} className={selectCls}>
                                                <option value="monthly">Mensual</option>
                                                {selectedPlan?.priceQuarterlyUsd && <option value="quarterly">Trimestral</option>}
                                                {selectedPlan?.priceAnnualUsd    && <option value="annual">Anual</option>}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Amount (read-only) */}
                                        <div>
                                            <label className={labelCls}>Monto (USD)</label>
                                            <div className="h-9 px-3 flex items-center rounded-lg border border-border-light bg-surface-2 font-mono text-[12px] text-foreground/60">
                                                ${amount}
                                            </div>
                                        </div>

                                        {/* Payment method */}
                                        <div>
                                            <label className={labelCls}>Método de pago</label>
                                            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={selectCls}>
                                                <option value="transferencia">Transferencia bancaria</option>
                                                <option value="zelle">Zelle</option>
                                                <option value="paypal">PayPal</option>
                                                <option value="binance">Binance Pay</option>
                                                <option value="efectivo">Efectivo</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Receipt URL */}
                                    <div>
                                        <label className={labelCls}>URL del comprobante (opcional)</label>
                                        <input
                                            type="url"
                                            value={receiptUrl}
                                            onChange={(e) => setReceiptUrl(e.target.value)}
                                            placeholder="https://drive.google.com/..."
                                            className={inputCls}
                                        />
                                    </div>

                                    {submitError && (
                                        <p className="font-mono text-[10px] text-red-500">{submitError}</p>
                                    )}
                                </div>

                                <div className="px-5 py-4 flex items-center justify-end gap-2">
                                    <button
                                        onClick={() => setFormOpen(false)}
                                        className="h-8 px-4 rounded-lg border border-border-light font-mono text-[10px] uppercase tracking-widest text-foreground/50 hover:text-foreground hover:border-border-medium transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting || !selPlanId}
                                        className={[
                                            "h-8 px-4 rounded-lg flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest",
                                            "bg-primary-500 text-white hover:bg-primary-600",
                                            "disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
                                        ].join(" ")}
                                    >
                                        {submitting && <Spinner />}
                                        {submitting ? "Enviando…" : "Enviar solicitud"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Payment history */}
                        <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/35 mb-3">
                                Historial de pagos
                            </p>

                            {history.length === 0 ? (
                                <div className="border border-border-light rounded-xl px-4 py-10 text-center">
                                    <p className="font-mono text-[11px] text-foreground/25 uppercase tracking-widest">
                                        Sin solicitudes de pago
                                    </p>
                                </div>
                            ) : (
                                <div className="border border-border-light rounded-xl overflow-hidden bg-surface-1">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-border-light bg-surface-2">
                                                {["Fecha", "Plan", "Ciclo", "Monto", "Método", "Estado"].map((h) => (
                                                    <th key={h} className="px-4 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 whitespace-nowrap">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((req) => {
                                                const plan = plans.find((p) => p.id === req.plan_id);
                                                return (
                                                    <tr key={req.id} className="border-b border-border-light/60 last:border-b-0 hover:bg-foreground/[0.02] transition-colors">
                                                        <td className="px-4 py-3 font-mono text-[11px] text-foreground/50">
                                                            {formatDate(req.submitted_at)}
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-[11px] text-foreground">
                                                            {plan?.name ?? req.plan_id}
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-[11px] text-foreground/60">
                                                            {CYCLE_LABEL[req.billing_cycle] ?? req.billing_cycle}
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-[11px] text-foreground tabular-nums">
                                                            ${req.amount_usd}
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-[11px] text-foreground/60 capitalize">
                                                            {req.payment_method}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={[
                                                                "h-5 px-2 rounded border font-mono text-[9px] uppercase tracking-[0.15em] inline-flex items-center",
                                                                STATUS_CLS[req.status] ?? "",
                                                            ].join(" ")}>
                                                                {STATUS_LABEL[req.status] ?? req.status}
                                                            </span>
                                                            {req.admin_note && (
                                                                <p className="font-mono text-[9px] text-foreground/30 mt-0.5 max-w-[160px] truncate" title={req.admin_note}>
                                                                    {req.admin_note}
                                                                </p>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}

            </div>
        </div>
    );
}
