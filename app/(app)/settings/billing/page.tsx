"use client";

import { useEffect, useState, useCallback } from "react";
import { 
    CreditCard, 
    Calendar, 
    Users, 
    Building2, 
    CheckCircle2, 
    AlertCircle, 
    Clock, 
    Plus, 
    X, 
    ArrowRight,
    Search,
    Receipt,
    LayoutDashboard,
    Package,
    Calculator
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCapacity } from "@/src/modules/billing/frontend/hooks/use-capacity";

import { BaseButton }  from "@/src/shared/frontend/components/base-button";

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
    moduleSlug:             string | null;
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

interface Subscription {
    id:                 string;
    status:             string;
    billingCycle:       string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd:   string | null;
    product:            { slug: string; name: string; description: string | null } | null;
    plan:               { name: string; priceMonthlyUsd: number } | null;
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
    <svg className="animate-spin text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

const MODULE_LABEL: Record<string, string> = {
    payroll:    "Nómina",
    inventory:  "Inventario",
    accounting: "Contabilidad",
};

const STATUS_CLS: Record<string, string> = {
    active:    "border badge-success",
    suspended: "border badge-error",
    trial:     "border badge-warning",
    pending:   "border badge-warning",
    approved:  "border badge-success",
    rejected:  "border badge-error",
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
    const [tenant,        setTenant]        = useState<TenantData | null>(null);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [plans,         setPlans]         = useState<Plan[]>([]);
    const [history,       setHistory]       = useState<PaymentRequest[]>([]);
    const [loading,       setLoading]       = useState(true);
    const [dataError,     setDataError]     = useState<string | null>(null);

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
            const [tenantRes, subsRes, plansRes, histRes] = await Promise.all([
                fetch("/api/billing/tenant"),
                fetch("/api/billing/subscriptions"),
                fetch("/api/billing/plans"),
                fetch("/api/billing/payment-requests"),
            ]);
            const [t, s, p, h] = await Promise.all([
                tenantRes.json(),
                subsRes.json(),
                plansRes.json(),
                histRes.json(),
            ]);
            if (t.data)  setTenant(t.data);
            if (s.data)  setSubscriptions(s.data);
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
        "w-full px-4 rounded-xl border bg-surface-1 outline-none",
        "text-base sm:text-[13px] text-foreground font-medium",
        "border-border-light focus:border-primary-500/60 hover:border-border-medium",
        "transition-all duration-200 placeholder:text-[var(--text-disabled)] shadow-sm shadow-black/5",
    ].join(" ");

    const selectCls = inputCls + " h-10 cursor-pointer pr-10 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M4%206l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_0.8rem_center] bg-[size:1.1rem] bg-no-repeat";
    const labelCls = "text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 block px-0.5";

    return (
        <div className="max-w-3xl space-y-8 w-full selection:bg-primary-500/30 font-mono">
            <div className="flex items-center justify-between border-b border-border-light/50 pb-4">
                <div>
                     <h2 className="font-mono text-xs font-semibold text-foreground/70 uppercase tracking-[0.14em]">Suscripción y Pagos</h2>
                     <p className="font-mono text-[11px] text-foreground/40 mt-1">Gestiona tu plan activo y pagos.</p>
                </div>
                <BaseButton.Root
                    onClick={() => { setFormOpen(true); setSubmitError(null); }}
                    disabled={formOpen || loading}
                    variant="primary"
                    size="md"
                    leftIcon={<Plus size={16} strokeWidth={3} />}
                >
                    Enviar pago
                </BaseButton.Root>
            </div>

                {/* Success banner */}
                {submitOk && (
                    <div className="px-4 py-3 border rounded-xl badge-success">
                        <p className="font-mono text-[11px] text-text-success">
                            Solicitud enviada. Un administrador la revisará pronto.
                        </p>
                    </div>
                )}

                {dataError && (
                    <div className="px-4 py-3 border rounded-xl badge-error">
                        <p className="font-mono text-[11px] text-text-error">{dataError}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-3 border border-dashed border-border-light rounded-2xl bg-surface-1/50">
                        <Spinner />
                        <span className="text-[12px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Cargando facturación…</span>
                    </div>
                ) : (
                    <>
                        {/* Current plan card */}
                        <div className="flex flex-col gap-4">
                            <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] flex items-center gap-2 px-1">
                                <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                                Plan Actual
                            </h2>

                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="border border-border-light rounded-2xl bg-surface-1 overflow-hidden shadow-sm shadow-black/5 divide-y divide-border-light/60"
                            >
                                {/* Plan info */}
                                <div className="px-6 py-6 flex items-start justify-between gap-4">
                                    <div className="flex gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-500 border border-primary-500/20">
                                            <CreditCard size={24} />
                                        </div>
                                        <div>
                                            <p className="text-[14px] font-bold text-foreground">
                                                {tenant?.plan?.name ?? "Sin plan activo"}
                                            </p>
                                            <p className="text-[12px] text-[var(--text-tertiary)] mt-1 font-medium capitalize flex items-center gap-1.5">
                                                <Calendar size={12} />
                                                {CYCLE_LABEL[tenant?.billingCycle ?? ""] ?? "Pago bajo demanda"} 
                                                {tenant?.plan && ` · $${tenant.plan.priceMonthlyUsd} USD / mes`}
                                            </p>
                                        </div>
                                    </div>
                                    {tenant?.status && (
                                        <span className={[
                                            "h-6 px-3 rounded-full border text-[10px] font-bold uppercase tracking-[0.1em] flex items-center gap-1.5",
                                            STATUS_CLS[tenant.status] ?? "",
                                        ].join(" ")}>
                                            <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                                            {STATUS_LABEL[tenant.status] ?? tenant.status}
                                        </span>
                                    )}
                                </div>

                                {/* Period */}
                                <div className="px-6 py-5 bg-surface-2/30 grid grid-cols-2 sm:grid-cols-2 gap-8 items-center border-t border-border-light">
                                    <div className="flex items-center gap-3">
                                        <div className="text-[var(--text-tertiary)]">
                                            <Clock size={16} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-tertiary)] font-bold">Vence en</p>
                                            <p className="text-[13px] font-bold text-foreground tabular-nums">
                                                {formatDate(tenant?.currentPeriodEnd)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-[var(--text-tertiary)]">
                                            <Receipt size={16} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-tertiary)] font-bold">Último Pago</p>
                                            <p className="text-[13px] font-bold text-foreground tabular-nums">
                                                {formatDate(tenant?.lastPaymentAt)}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Capacity / Usage Meters */}
                                {capacity && (
                                    <div className="px-6 py-6 grid grid-cols-1 sm:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-tertiary)] flex items-center gap-2">
                                                    <Building2 size={13} /> Empresas
                                                </p>
                                                <p className="text-[12px] font-bold text-foreground tabular-nums">
                                                    {capacity.companies.used} / {capacity.companies.max ?? "∞"}
                                                </p>
                                            </div>
                                            {capacity.companies.max !== null && (
                                                <div className="h-2 rounded-full bg-surface-2 overflow-hidden border border-border-light/50">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${Math.min(100, (capacity.companies.used / (capacity.companies.max || 1)) * 100)}%` }}
                                                        transition={{ duration: 1, ease: "easeOut" }}
                                                        className="h-full rounded-full bg-gradient-to-r from-primary-500/80 to-primary-500 shadow-[0_0_8px_rgba(var(--primary-500-rgb),0.3)]"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-tertiary)] flex items-center gap-2">
                                                    <Users size={13} /> Empleados por empresa
                                                </p>
                                                <p className="text-[12px] font-bold text-foreground tabular-nums">
                                                    {capacity.employeesPerCompany.max ?? "Ilimitados"}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 text-[12px] text-[var(--text-tertiary)] font-medium bg-surface-2/50 px-3 py-1.5 rounded-lg border border-border-light/50 w-fit">
                                                <CheckCircle2 size={14} className="text-primary-500" />
                                                Límite de suscripción activo
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </div>

                        {/* Module subscriptions grid */}
                        <div className="flex flex-col gap-4">
                            <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] flex items-center gap-2 px-1">
                                <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                                Suscripciones por Módulo
                            </h2>

                            <div className="grid grid-cols-1 gap-3">
                                    {subscriptions.map((sub, index) => (
                                        <motion.div 
                                            key={sub.id} 
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            className="border border-border-light rounded-2xl bg-surface-1 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-primary-500/30 transition-all duration-200"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl border border-border-light bg-surface-2 flex items-center justify-center text-[var(--text-tertiary)] flex-shrink-0">
                                                    {sub.product?.slug === "payroll" && <Receipt size={20} />}
                                                    {sub.product?.slug === "inventory" && <Package size={20} />}
                                                    {sub.product?.slug === "accounting" && <Calculator size={20} />}
                                                </div>
                                                <div>
                                                    <p className="text-[14px] font-bold text-foreground">
                                                        {sub.product?.name ?? sub.product?.slug}
                                                    </p>
                                                    <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5 line-clamp-1">
                                                        {sub.product?.description ?? "Acceso al módulo completo"}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 justify-between sm:justify-end">
                                                {sub.plan && (
                                                    <div className="text-right">
                                                        <p className="text-[13px] font-bold text-foreground tabular-nums">
                                                            ${sub.plan.priceMonthlyUsd}
                                                        </p>
                                                        <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">USD / mes</p>
                                                    </div>
                                                )}
                                                <span className={[
                                                    "h-6 px-3 rounded-full border text-[10px] font-bold uppercase tracking-[0.1em] flex items-center",
                                                    STATUS_CLS[sub.status] ?? "",
                                                ].join(" ")}>
                                                    {STATUS_LABEL[sub.status] ?? sub.status}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}

                                    {/* Inventory upsell */}
                                    {!subscriptions.some((s) => s.product?.slug === "inventory") && (
                                        <div className="border border-dashed border-border-light rounded-2xl bg-surface-1/40 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-surface-1/60 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl border border-dashed border-border-light bg-surface-2 flex items-center justify-center text-[var(--text-tertiary)]/50 flex-shrink-0 group-hover:text-primary-500/60 transition-colors">
                                                    <Package size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-[14px] font-bold text-[var(--text-tertiary)] group-hover:text-foreground transition-colors">
                                                        Inventario
                                                    </p>
                                                    <p className="text-[12px] text-[var(--text-tertiary)]/60 mt-0.5">
                                                        Desde $9 / mes · Actívalo enviando un pago
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-tertiary)]/50 border border-border-light rounded-full h-6 px-3 flex items-center">
                                                No habilitado
                                            </span>
                                        </div>
                                    )}

                                    {/* Accounting upsell */}
                                    {!subscriptions.some((s) => s.product?.slug === "accounting") && (
                                        <div className="border border-dashed border-border-light rounded-2xl bg-surface-1/40 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-surface-1/60 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl border border-dashed border-border-light bg-surface-2 flex items-center justify-center text-[var(--text-tertiary)]/50 flex-shrink-0 group-hover:text-primary-500/60 transition-colors">
                                                    <Calculator size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-[14px] font-bold text-[var(--text-tertiary)] group-hover:text-foreground transition-colors">
                                                        Contabilidad
                                                    </p>
                                                    <p className="text-[12px] text-[var(--text-tertiary)]/60 mt-0.5">
                                                        Desde $7 / mes · Plan de cuentas, asientos y balances
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-tertiary)]/50 border border-border-light rounded-full h-6 px-3 flex items-center">
                                                No habilitado
                                            </span>
                                        </div>
                                    )}
                            </div>
                        </div>

                        {/* Payment form segment */}
                        <AnimatePresence>
                            {formOpen && (
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                    className="border-2 border-primary-500/20 rounded-2xl bg-surface-1 overflow-hidden shadow-xl shadow-primary-500/5 divide-y divide-border-light/60"
                                >
                                    <div className="px-6 py-4 flex items-center justify-between bg-primary-500/5">
                                        <h2 className="text-[13px] font-bold uppercase tracking-[0.15em] text-foreground">
                                            Nueva Solicitud de Pago
                                        </h2>
                                        <BaseButton.Icon
                                            onClick={() => setFormOpen(false)}
                                            variant="ghost"
                                            size="sm"
                                        >
                                            <X size={16} />
                                        </BaseButton.Icon>
                                    </div>

                                    <div className="px-6 py-6 space-y-6">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            {/* Plan */}
                                            <div className="space-y-1.5">
                                                <label htmlFor="sel-plan" className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Plan</label>
                                                <select id="sel-plan" value={selPlanId} onChange={(e) => { setSelPlanId(e.target.value); setSelCycle("monthly"); }} className={selectCls}>
                                                    {(["payroll", "inventory", "accounting", null] as (string | null)[]).map((slug) => {
                                                        const group = plans.filter((p) => p.moduleSlug === slug);
                                                        if (group.length === 0) return null;
                                                        const label = slug ? (MODULE_LABEL[slug] ?? slug) : "General";
                                                        return (
                                                            <optgroup key={slug ?? "__general"} label={label}>
                                                                {group.map((p) => (
                                                                    <option key={p.id} value={p.id}>
                                                                        {p.name} — ${p.priceMonthlyUsd}/mes
                                                                    </option>
                                                                ))}
                                                            </optgroup>
                                                        );
                                                    })}
                                                </select>
                                            </div>

                                            {/* Cycle */}
                                            <div className="space-y-1.5">
                                                <label htmlFor="sel-cycle" className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Ciclo de pago</label>
                                                <select id="sel-cycle" value={selCycle} onChange={(e) => setSelCycle(e.target.value)} className={selectCls}>
                                                    <option value="monthly">Mensual</option>
                                                    {selectedPlan?.priceQuarterlyUsd && <option value="quarterly">Trimestral</option>}
                                                    {selectedPlan?.priceAnnualUsd    && <option value="annual">Anual</option>}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            {/* Amount (read-only) */}
                                            <div className="space-y-1.5">
                                                <label htmlFor="sel-amount" className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Monto a pagar</label>
                                                <div id="sel-amount" className="h-10 px-4 flex items-center rounded-xl border border-border-light bg-surface-2 font-bold text-[14px] text-foreground tabular-nums">
                                                    ${amount} <span className="text-[10px] text-[var(--text-tertiary)] ml-1.5 font-normal">USD</span>
                                                </div>
                                            </div>

                                            {/* Payment method */}
                                            <div className="space-y-1.5">
                                                <label htmlFor="sel-method" className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Método de pago</label>
                                                <select id="sel-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={selectCls}>
                                                    <option value="transferencia">Transferencia bancaria</option>
                                                    <option value="zelle">Zelle</option>
                                                    <option value="paypal">PayPal</option>
                                                    <option value="binance">Binance Pay</option>
                                                    <option value="efectivo">Efectivo</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Receipt URL */}
                                        <div className="space-y-1.5">
                                            <label htmlFor="inp-receipt" className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">URL del comprobante (opcional)</label>
                                            <input
                                                id="inp-receipt"
                                                type="url"
                                                value={receiptUrl}
                                                onChange={(e) => setReceiptUrl(e.target.value)}
                                                placeholder="https://drive.google.com/..."
                                                className={inputCls + " h-10 px-4 rounded-xl"}
                                            />
                                        </div>

                                        {submitError && (
                                            <div className="flex items-center gap-2 text-error text-[12px] font-medium bg-error/5 p-3 rounded-lg border border-error/20">
                                                <AlertCircle size={14} />
                                                {submitError}
                                            </div>
                                        )}
                                    </div>

                                    <div className="px-6 py-4 flex items-center justify-end gap-3 bg-surface-2/30">
                                        <BaseButton.Root
                                            onClick={() => setFormOpen(false)}
                                            variant="ghost"
                                            size="md"
                                        >
                                            Cancelar
                                        </BaseButton.Root>
                                        <BaseButton.Root
                                            onClick={handleSubmit}
                                            disabled={submitting || !selPlanId}
                                            loading={submitting}
                                            variant="primary"
                                            size="md"
                                        >
                                            Enviar solicitud
                                        </BaseButton.Root>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Payment history list */}
                        <div className="flex flex-col gap-4">
                            <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] flex items-center gap-2 px-1">
                                <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                                Historial de Pagos
                            </h2>

                            {history.length === 0 ? (
                                <div className="border border-dashed border-border-light rounded-2xl px-4 py-12 text-center bg-surface-1/50">
                                    <p className="text-[12px] font-bold uppercase tracking-widest text-[var(--text-disabled)] mb-1">
                                        Sin solicitudes de pago
                                    </p>
                                    <p className="text-[11px] text-[var(--text-tertiary)]">
                                        Tus futuras solicitudes de suscripción aparecerán aquí.
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden shadow-sm shadow-black/5">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-surface-2/30 border-b border-border-light font-bold">
                                                    {["Fecha", "Plan", "Ciclo", "Monto", "Método", "Estado"].map((h) => (
                                                        <th key={h} className="px-6 py-4 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-light/60">
                                                {history.map((req) => {
                                                    const plan = plans.find((p) => p.id === req.plan_id);
                                                    return (
                                                        <tr key={req.id} className="hover:bg-foreground/[0.02] transition-colors group">
                                                            <td className="px-6 py-4 text-[13px] text-[var(--text-secondary)] tabular-nums">
                                                                {formatDate(req.submitted_at)}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="text-[13px] font-bold text-foreground">
                                                                    {plan?.name ?? req.plan_id}
                                                                </div>
                                                                {req.admin_note && (
                                                                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 line-clamp-1 group-hover:line-clamp-none max-w-[180px]" title={req.admin_note}>
                                                                        Nota: {req.admin_note}
                                                                    </p>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 text-[13px] text-[var(--text-secondary)]">
                                                                {CYCLE_LABEL[req.billing_cycle] ?? req.billing_cycle}
                                                            </td>
                                                            <td className="px-6 py-4 text-[13px] font-bold text-foreground tabular-nums">
                                                                ${req.amount_usd}
                                                            </td>
                                                            <td className="px-6 py-4 text-[13px] text-[var(--text-secondary)] capitalize">
                                                                {req.payment_method}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className={[
                                                                    "h-6 px-3 rounded-full border text-[10px] font-bold uppercase tracking-[0.1em] inline-flex items-center",
                                                                    STATUS_CLS[req.status] ?? "",
                                                                ].join(" ")}>
                                                                    {STATUS_LABEL[req.status] ?? req.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

        </div>
    );
}
