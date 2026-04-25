"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
    CreditCard,
    Calendar,
    Users,
    Building2,
    CheckCircle2,
    AlertCircle,
    Clock,
    X,
    Receipt,
    Check,
    Minus,
    Phone,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCapacity } from "@/src/modules/billing/frontend/hooks/use-capacity";
import { useAvailableCredit } from "@/src/modules/referrals/frontend/hooks/use-referrals";
import { BaseButton }  from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";

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
    isContactOnly:          boolean;
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
    <svg className="animate-spin text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

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

// Features shown in plan comparison cards
const PLAN_FEATURES = [
    { key: "companies", label: "Empresas" },
    { key: "nomina",    label: "Nómina" },
    { key: "inventory", label: "Inventario" },
    { key: "accounting",label: "Contabilidad" },
    { key: "documents", label: "Documentos" },
];

function getPlanFeatures(plan: Plan): Record<string, string | boolean> {
    const isGratuito = plan.name === "Gratuito";
    return {
        companies:  plan.maxCompanies === null ? "Ilimitadas" : `${plan.maxCompanies}`,
        nomina:     !isGratuito,
        inventory:  !isGratuito,
        accounting: !isGratuito,
        documents:  true,
    };
}

// Order plans for display (Emprendedor highlighted as featured)
const PLAN_ORDER = ["Gratuito", "Estudiante", "Emprendedor", "Contable", "Empresarial"];

// ============================================================================
// PAGE
// ============================================================================

export default function BillingPage() {
    const { capacity } = useCapacity();
    const { availableUsd, reload: reloadCredit } = useAvailableCredit();

    // ── Data ──────────────────────────────────────────────────────────────
    const [tenant,    setTenant]    = useState<TenantData | null>(null);
    const [plans,     setPlans]     = useState<Plan[]>([]);
    const [history,   setHistory]   = useState<PaymentRequest[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);

    // ── Payment form ──────────────────────────────────────────────────────
    const formRef = useRef<HTMLDivElement>(null);
    const [formOpen,    setFormOpen]    = useState(false);
    const [selPlanId,   setSelPlanId]   = useState("");
    const [selCycle,    setSelCycle]    = useState("monthly");
    const [payMethod,   setPayMethod]   = useState("transferencia");
    const [receiptUrl,  setReceiptUrl]  = useState("");
    const [submitting,  setSubmitting]  = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitOk,    setSubmitOk]    = useState(false);

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
            if (t.data) setTenant(t.data);
            if (p.data) {
                // Sort by defined order, then fallback to price
                const sorted = (p.data as Plan[]).sort((a, b) => {
                    const ia = PLAN_ORDER.indexOf(a.name);
                    const ib = PLAN_ORDER.indexOf(b.name);
                    if (ia !== -1 && ib !== -1) return ia - ib;
                    if (ia !== -1) return -1;
                    if (ib !== -1) return 1;
                    return a.priceMonthlyUsd - b.priceMonthlyUsd;
                });
                setPlans(sorted);
            }
            if (h.data) setHistory(h.data);
        } catch {
            setDataError("Error al cargar los datos de facturación.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ── Submit payment request ─────────────────────────────────────────────
    const selectedPlan = plans.find((p) => p.id === selPlanId);
    const amount   = selectedPlan ? planPrice(selectedPlan, selCycle) : 0;
    const discount = Math.min(availableUsd, amount);
    const total    = Math.max(0, Math.round((amount - discount) * 100) / 100);
    const fullyCovered = amount > 0 && total === 0;

    const openFormForPlan = (planId: string) => {
        setSelPlanId(planId);
        setSelCycle("monthly");
        setSubmitError(null);
        setFormOpen(true);
        requestAnimationFrame(() => {
            formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            formRef.current?.querySelector<HTMLElement>("select, input, button")?.focus();
        });
    };

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
            await Promise.all([loadAll(), reloadCredit()]);
            setTimeout(() => setSubmitOk(false), 4000);
        }
    }, [selPlanId, selCycle, amount, payMethod, receiptUrl, loadAll, reloadCredit]);

    // ── Render ─────────────────────────────────────────────────────────────

    const inputCls = [
        "w-full px-4 rounded-xl border bg-surface-1 outline-none",
        "text-base sm:text-[13px] text-foreground font-medium",
        "border-border-light focus:border-primary-500/60 hover:border-border-medium",
        "transition-all duration-200 placeholder:text-[var(--text-disabled)] shadow-sm shadow-black/5",
    ].join(" ");

    const selectCls = inputCls + " h-10 cursor-pointer pr-10 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M4%206l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_0.8rem_center] bg-[size:1.1rem] bg-no-repeat";

    const currentPlanId = tenant?.plan?.id;

    return (
        <div className="space-y-6 w-full selection:bg-primary-500/30 font-mono">
            {submitOk && (
                <div className="flex items-center gap-2 px-4 py-3 border rounded-lg badge-success">
                    <CheckCircle2 size={14} />
                    <p className="font-sans text-[12px] text-text-success">
                        Solicitud enviada. Un administrador la revisará pronto.
                    </p>
                </div>
            )}

            {dataError && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 border rounded-lg badge-error">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={14} />
                        <p className="font-sans text-[12px] text-text-error">{dataError}</p>
                    </div>
                    <button onClick={loadAll} className="font-mono text-[11px] uppercase tracking-[0.1em] font-bold text-text-error underline underline-offset-2 hover:no-underline shrink-0">
                        Reintentar
                    </button>
                </div>
            )}

            {loading ? (
                <SettingsSection title="Facturación" subtitle="Cargando…">
                    <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <Spinner />
                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                            Cargando facturación…
                        </span>
                    </div>
                </SettingsSection>
            ) : (
                <>
                    {/* ── Plan comparison grid ─────────────────────────────── */}
                    <SettingsSection
                        title="Planes disponibles"
                        subtitle="Compara los planes y solicita el que mejor se ajuste a tu operación."
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                            {plans.map((plan, index) => {
                                const isCurrent  = plan.id === currentPlanId;
                                const isFeatured = plan.name === "Emprendedor";
                                const features   = getPlanFeatures(plan);

                                return (
                                    <motion.div
                                        key={plan.id}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.06 }}
                                        className={[
                                            "relative rounded-xl border flex flex-col overflow-hidden transition-colors duration-150",
                                            isFeatured
                                                ? "border-primary-500/40 bg-primary-500/[0.04] shadow-md shadow-primary-500/10"
                                                : "border-border-light bg-surface-1",
                                            isCurrent && "ring-2 ring-primary-500/30",
                                        ].filter(Boolean).join(" ")}
                                    >
                                        {/* Only one banner at a time — current takes priority over featured */}
                                        {isCurrent ? (
                                            <div className="bg-primary-500/10 border-b border-primary-500/20 text-primary-500 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-center py-1.5">
                                                Plan actual
                                            </div>
                                        ) : isFeatured ? (
                                            <div className="bg-primary-500 text-white font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-center py-1.5">
                                                Popular
                                            </div>
                                        ) : null}

                                        <div className="px-4 pt-5 pb-4 flex flex-col gap-4 flex-1">
                                            {/* Name + price */}
                                            <div>
                                                <p className="font-mono text-[13px] font-bold uppercase tracking-[0.1em] text-foreground">{plan.name}</p>
                                                {plan.isContactOnly ? (
                                                    <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-1">Precio personalizado</p>
                                                ) : plan.priceMonthlyUsd === 0 ? (
                                                    <p className="font-mono text-[22px] font-bold text-foreground tabular-nums mt-1">Gratis</p>
                                                ) : (
                                                    <div className="mt-1 flex items-baseline">
                                                        <span className="font-mono text-[22px] font-bold text-foreground tabular-nums">${plan.priceMonthlyUsd}</span>
                                                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] ml-1.5">USD/mes</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Features */}
                                            <ul className="space-y-2 flex-1">
                                                {PLAN_FEATURES.map((feat) => {
                                                    const val = features[feat.key];
                                                    const isIncluded = val === true || typeof val === "string";
                                                    return (
                                                        <li key={feat.key} className="flex items-center gap-2 font-sans text-[12px]">
                                                            {typeof val === "string" ? (
                                                                <span className="w-3.5 h-3.5 flex items-center justify-center text-primary-500 flex-shrink-0">
                                                                    <Building2 size={12} />
                                                                </span>
                                                            ) : isIncluded ? (
                                                                <Check size={12} className="text-primary-500 flex-shrink-0" strokeWidth={3} />
                                                            ) : (
                                                                <Minus size={12} className="text-[var(--text-disabled)] flex-shrink-0" strokeWidth={2} />
                                                            )}
                                                            <span className={isIncluded ? "text-[var(--text-secondary)]" : "text-[var(--text-disabled)]"}>
                                                                {feat.key === "companies" ? `${val} empresa${val === "1" ? "" : "s"}` : feat.label}
                                                            </span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>

                                            {/* CTA */}
                                            <div className="pt-1">
                                                {plan.isContactOnly ? (
                                                    <BaseButton.Root
                                                        as="a"
                                                        href="mailto:contacto@kont.app"
                                                        variant="outline"
                                                        size="sm"
                                                        leftIcon={<Phone size={11} strokeWidth={2.5} />}
                                                        className="w-full"
                                                    >
                                                        Contáctanos
                                                    </BaseButton.Root>
                                                ) : isCurrent ? (
                                                    <div
                                                        aria-label={`Plan actual: ${plan.name}`}
                                                        className="w-full h-8 rounded-xl border border-border-light bg-surface-2 text-[11px] font-bold uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 text-[var(--text-tertiary)]"
                                                    >
                                                        <CheckCircle2 size={11} strokeWidth={2.5} />
                                                        Plan actual
                                                    </div>
                                                ) : plan.priceMonthlyUsd === 0 ? (
                                                    <div className="h-8" aria-hidden="true" />
                                                ) : (
                                                    <BaseButton.Root
                                                        variant="primary"
                                                        size="sm"
                                                        onClick={() => openFormForPlan(plan.id)}
                                                        className="w-full"
                                                    >
                                                        Seleccionar
                                                    </BaseButton.Root>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </SettingsSection>

                    {/* ── Current plan card ────────────────────────────────── */}
                    <SettingsSection
                        title="Plan actual"
                        subtitle="Resumen del plan activo, ciclo de pago y capacidad consumida en tu tenant."
                        flush
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="divide-y divide-border-light/60"
                        >
                            {/* Plan info */}
                            <div className="px-6 py-5 flex items-start justify-between gap-4">
                                <div className="flex gap-4">
                                    <div className="w-11 h-11 rounded-lg bg-primary-500/10 flex items-center justify-center text-primary-500 border border-primary-500/20 shrink-0">
                                        <CreditCard size={20} />
                                    </div>
                                    <div>
                                        <p className="font-mono text-[14px] font-bold uppercase tracking-[0.1em] text-foreground">
                                            {tenant?.plan?.name ?? "Sin plan activo"}
                                        </p>
                                        <p className="font-mono text-[12px] text-[var(--text-tertiary)] mt-1 flex items-center gap-1.5">
                                            <Calendar size={12} />
                                            <span>{CYCLE_LABEL[tenant?.billingCycle ?? ""] ?? "Pago bajo demanda"}</span>
                                            {tenant?.plan && tenant.plan.priceMonthlyUsd > 0 && (
                                                <span className="text-[var(--text-tertiary)]">
                                                    · ${tenant.plan.priceMonthlyUsd} USD/mes
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                {tenant?.status && (
                                    <span className={[
                                        "h-6 px-2.5 rounded-md border font-mono text-[10px] font-bold uppercase tracking-[0.1em] flex items-center gap-1.5 shrink-0",
                                        STATUS_CLS[tenant.status] ?? "",
                                    ].join(" ")}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                                        {STATUS_LABEL[tenant.status] ?? tenant.status}
                                    </span>
                                )}
                            </div>

                            {/* Period */}
                            <div className="px-6 py-4 bg-surface-2/30 grid grid-cols-2 gap-8 items-center border-t border-border-light">
                                <div className="flex items-center gap-3">
                                    <div className="text-[var(--text-tertiary)]"><Clock size={14} /></div>
                                    <div>
                                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-bold">Vence en</p>
                                        <p className="font-mono text-[13px] font-bold text-foreground tabular-nums mt-0.5">{formatDate(tenant?.currentPeriodEnd)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-[var(--text-tertiary)]"><Receipt size={14} /></div>
                                    <div>
                                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-bold">Último pago</p>
                                        <p className="font-mono text-[13px] font-bold text-foreground tabular-nums mt-0.5">{formatDate(tenant?.lastPaymentAt)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Capacity meters */}
                            {capacity && (
                                <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-8">
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)] flex items-center gap-2">
                                                <Building2 size={13} /> Empresas
                                            </p>
                                            <p className="font-mono text-[12px] font-bold text-foreground tabular-nums">
                                                {capacity.companies.used} / {capacity.companies.max ?? "∞"}
                                            </p>
                                        </div>
                                        {capacity.companies.max !== null && (
                                            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden border border-border-light/50">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.min(100, (capacity.companies.used / (capacity.companies.max || 1)) * 100)}%` }}
                                                    transition={{ duration: 1, ease: "easeOut" }}
                                                    className="h-full rounded-full bg-primary-500"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)] flex items-center gap-2">
                                                <Users size={13} /> Empleados por empresa
                                            </p>
                                            <p className="font-mono text-[12px] font-bold text-foreground tabular-nums">
                                                {capacity.employeesPerCompany.max ?? "Ilimitados"}
                                            </p>
                                        </div>
                                        <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-tertiary)] bg-surface-2/60 px-2.5 py-1 rounded-md border border-border-light/60 w-fit">
                                            <CheckCircle2 size={12} className="text-primary-500" />
                                            Límite de suscripción activo
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </SettingsSection>

                    {/* ── Payment form ─────────────────────────────────────── */}
                    <AnimatePresence>
                        {formOpen && (
                            <motion.div
                                ref={formRef}
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                className="border-2 border-primary-500/30 rounded-xl bg-surface-1 overflow-hidden shadow-md shadow-primary-500/10 divide-y divide-border-light/60"
                            >
                                <div className="px-6 py-4 flex items-center justify-between bg-primary-500/5">
                                    <h2 className="font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-foreground">
                                        Solicitud — {selectedPlan?.name ?? "Plan"}
                                    </h2>
                                    <BaseButton.Icon
                                        onClick={() => setFormOpen(false)}
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Cerrar formulario de pago"
                                    >
                                        <X size={16} aria-hidden="true" />
                                    </BaseButton.Icon>
                                </div>

                                <div className="px-6 py-6 space-y-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        {/* Plan */}
                                        <div className="space-y-1.5">
                                            <label htmlFor="sel-plan" className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Plan</label>
                                            <select id="sel-plan" value={selPlanId} onChange={(e) => { setSelPlanId(e.target.value); setSelCycle("monthly"); }} className={selectCls}>
                                                {plans.filter((p) => !p.isContactOnly && p.priceMonthlyUsd > 0).map((p) => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name} — ${p.priceMonthlyUsd}/mes
                                                    </option>
                                                ))}
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
                                        {/* Amount breakdown */}
                                        <div className="space-y-1.5">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Monto a pagar</p>
                                            <div className="rounded-xl border border-border-light bg-surface-2 px-4 py-3 space-y-1.5">
                                                <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)]">
                                                    <span>Precio del plan</span>
                                                    <span className="tabular-nums font-medium">${amount.toFixed(2)}</span>
                                                </div>
                                                {discount > 0 && (
                                                    <div className="flex items-center justify-between text-[12px] text-primary-500">
                                                        <span>Crédito referidos</span>
                                                        <span className="tabular-nums font-bold">−${discount.toFixed(2)}</span>
                                                    </div>
                                                )}
                                                <div className="border-t border-border-light pt-1.5 flex items-center justify-between">
                                                    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">Total</span>
                                                    <span className="text-[16px] font-bold text-foreground tabular-nums">
                                                        ${total.toFixed(2)} <span className="text-[10px] text-[var(--text-tertiary)] ml-1 font-normal">USD</span>
                                                    </span>
                                                </div>
                                            </div>
                                            {fullyCovered ? (
                                                <p className="text-[10px] text-primary-500 font-medium">
                                                    Tu crédito cubre el total. Al activar, el plan queda al día sin comprobante.
                                                </p>
                                            ) : availableUsd > 0 ? (
                                                <p className="text-[10px] text-[var(--text-tertiary)] font-medium">
                                                    Tienes <span className="text-primary-500 font-bold">${availableUsd.toFixed(2)}</span> disponibles de referidos. Se aplica al enviar.
                                                </p>
                                            ) : null}
                                        </div>

                                        {/* Payment method */}
                                        {!fullyCovered && (
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
                                        )}
                                    </div>

                                    {/* Receipt URL */}
                                    {!fullyCovered && (
                                        <BaseInput.Field
                                            label="URL del comprobante (opcional)"
                                            type="url"
                                            value={receiptUrl}
                                            onValueChange={setReceiptUrl}
                                            placeholder="https://drive.google.com/..."
                                        />
                                    )}

                                    {submitError && (
                                        <div className="flex items-center gap-2 text-error text-[12px] font-medium bg-error/5 p-3 rounded-lg border border-error/20">
                                            <AlertCircle size={14} />
                                            {submitError}
                                        </div>
                                    )}
                                </div>

                                <div className="px-6 py-4 flex items-center justify-end gap-3 bg-surface-2/30">
                                    <BaseButton.Root onClick={() => setFormOpen(false)} variant="ghost" size="md">
                                        Cancelar
                                    </BaseButton.Root>
                                    <BaseButton.Root
                                        onClick={handleSubmit}
                                        disabled={submitting || !selPlanId}
                                        loading={submitting}
                                        variant="primary"
                                        size="md"
                                    >
                                        {fullyCovered ? "Activar con crédito" : "Enviar solicitud"}
                                    </BaseButton.Root>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── Payment history ───────────────────────────────────── */}
                    <SettingsSection
                        title="Historial de pagos"
                        subtitle="Solicitudes de pago enviadas y su estado de aprobación."
                        flush
                    >
                        {history.length === 0 ? (
                            <div className="px-4 py-12 text-center">
                                <p className="font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-disabled)] mb-1">
                                    Sin solicitudes de pago
                                </p>
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)]">
                                    Tus futuras solicitudes de suscripción aparecerán aquí.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-surface-2/30 border-b border-border-light">
                                            {["Fecha", "Plan", "Ciclo", "Monto", "Método", "Estado"].map((h) => (
                                                <th key={h} className="px-5 py-3 text-left font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)] whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-light/60">
                                        {history.map((req) => {
                                            const plan = plans.find((p) => p.id === req.plan_id);
                                            return (
                                                <tr key={req.id} className="hover:bg-surface-2/40 transition-colors group">
                                                    <td className="px-5 py-3 font-mono text-[13px] text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                                                        {formatDate(req.submitted_at)}
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <div className="font-mono text-[13px] font-bold text-foreground">
                                                            {plan?.name ?? req.plan_id}
                                                        </div>
                                                        {req.admin_note && (
                                                            <p className="font-sans text-[11px] text-[var(--text-tertiary)] mt-0.5 line-clamp-1 group-hover:line-clamp-none max-w-[200px]" title={req.admin_note}>
                                                                Nota: {req.admin_note}
                                                            </p>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3 font-mono text-[13px] text-[var(--text-secondary)]">
                                                        {CYCLE_LABEL[req.billing_cycle] ?? req.billing_cycle}
                                                    </td>
                                                    <td className="px-5 py-3 font-mono text-[13px] font-bold text-foreground tabular-nums">
                                                        ${req.amount_usd}
                                                    </td>
                                                    <td className="px-5 py-3 font-mono text-[13px] text-[var(--text-secondary)] capitalize">
                                                        {req.payment_method}
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <span className={[
                                                            "h-6 px-2.5 rounded-md border font-mono text-[10px] font-bold uppercase tracking-[0.1em] inline-flex items-center",
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
                        )}
                    </SettingsSection>
                </>
            )}
        </div>
    );
}
