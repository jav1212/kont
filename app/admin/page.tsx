"use client";

import { useEffect, useState, useCallback, Fragment } from "react";

// ============================================================================
// TYPES
// ============================================================================

interface PlatformSummary {
    total_tenants:   number;
    active_tenants:  number;
    pending_tenants: number;
    suspended_tenants: number;
    total_companies: number;
    total_employees: number;
    pending_payments: number;
    mrr_usd:         number | null;
}

interface PaymentRequest {
    id:             string;
    tenant_id:      string;
    plan_id:        string;
    billing_cycle:  string;
    amount_usd:     number;
    payment_method: string;
    receipt_url:    string | null;
    status:         "pending" | "approved" | "rejected";
    submitted_at:   string;
    reviewed_at:    string | null;
    notes:          string | null;
    tenants?: {
        id:          string;
        status:      string;
        schema_name: string;
        plans?:      { name: string } | null;
    } | null;
}

interface AdminUser {
    id:         string;
    email:      string;
    created_at: string;
}

interface TenantRow {
    tenant_id:        string;
    email:            string | null;
    status:           string;
    plan_name:        string | null;
    total_companies:  number;
    total_employees:  number;
    created_at:       string;
    current_period_end: string | null;
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
    active: "Activo", suspended: "Suspendido", trial: "Prueba",
    pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado",
};

const CYCLE_LABEL: Record<string, string> = {
    monthly: "Mensual", quarterly: "Trimestral", annual: "Anual",
};

function formatDate(iso?: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

// ============================================================================
// PAGE
// ============================================================================

export default function AdminPage() {
    const [tab, setTab] = useState<"payments" | "tenants" | "admins">("payments");

    // Data
    const [summary,  setSummary]  = useState<PlatformSummary | null>(null);
    const [payments, setPayments] = useState<PaymentRequest[]>([]);
    const [tenants,  setTenants]  = useState<TenantRow[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState<string | null>(null);

    // Payment filter
    const [payFilter, setPayFilter] = useState<"" | "pending" | "approved" | "rejected">("");

    // Action state
    const [actionId,    setActionId]    = useState<string | null>(null);
    const [actionNote,  setActionNote]  = useState("");
    const [actioning,   setActioning]   = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    // Tenant status override
    const [tenantActionId,     setTenantActionId]     = useState<string | null>(null);
    const [tenantActionStatus, setTenantActionStatus] = useState("");
    const [tenantActioning,    setTenantActioning]    = useState(false);

    // Admin users
    const [admins,       setAdmins]       = useState<AdminUser[]>([]);
    const [adminsLoaded, setAdminsLoaded] = useState(false);
    const [newAdminEmail,    setNewAdminEmail]    = useState("");
    const [newAdminPassword, setNewAdminPassword] = useState("");
    const [newAdminSaving,   setNewAdminSaving]   = useState(false);
    const [newAdminError,    setNewAdminError]    = useState<string | null>(null);
    const [newAdminOk,       setNewAdminOk]       = useState(false);
    const [deletingAdmin,    setDeletingAdmin]    = useState<string | null>(null);
    const [confirmDeleteAdmin, setConfirmDeleteAdmin] = useState<string | null>(null);

    // ── Load ──────────────────────────────────────────────────────────────
    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [sumRes, tenRes] = await Promise.all([
                fetch("/api/admin/summary"),
                fetch("/api/admin/tenants"),
            ]);
            if (sumRes.status === 403) { setError("Acceso denegado. Esta página es solo para administradores."); setLoading(false); return; }
            const [s, t] = await Promise.all([sumRes.json(), tenRes.json()]);
            if (s.data) setSummary(s.data);
            if (t.data) setTenants(t.data);
        } catch {
            setError("Error al cargar datos.");
        } finally {
            setLoading(false);
        }
    }, []);

    const loadPayments = useCallback(async () => {
        const url = payFilter ? `/api/admin/payment-requests?status=${payFilter}` : "/api/admin/payment-requests";
        const res = await fetch(url);
        const json = await res.json();
        if (json.data) setPayments(json.data);
    }, [payFilter]);

    useEffect(() => { loadAll(); }, [loadAll]);
    useEffect(() => { loadPayments(); }, [loadPayments]);

    // ── Approve / Reject payment ──────────────────────────────────────────
    const handlePaymentAction = useCallback(async (id: string, action: "approve" | "reject") => {
        setActioning(true);
        setActionError(null);
        const res = await fetch(`/api/admin/payment-requests/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, notes: actionNote.trim() || null }),
        });
        const json = await res.json();
        setActioning(false);
        if (!res.ok) {
            setActionError(json.error ?? "Error al procesar.");
        } else {
            setActionId(null);
            setActionNote("");
            await Promise.all([loadPayments(), loadAll()]);
        }
    }, [actionNote, loadPayments, loadAll]);

    // ── Load admins (lazy, solo cuando se abre la pestaña) ───────────────
    const loadAdmins = useCallback(async () => {
        const res  = await fetch("/api/admin/admins");
        const json = await res.json();
        if (json.data) setAdmins(json.data);
        setAdminsLoaded(true);
    }, []);

    useEffect(() => {
        if (tab === "admins" && !adminsLoaded) loadAdmins();
    }, [tab, adminsLoaded, loadAdmins]);

    // ── Create admin ──────────────────────────────────────────────────────
    const handleCreateAdmin = useCallback(async () => {
        setNewAdminError(null);
        if (!newAdminEmail.trim())    { setNewAdminError("El correo es requerido."); return; }
        if (!newAdminPassword)        { setNewAdminError("La contraseña es requerida."); return; }
        if (newAdminPassword.length < 8) { setNewAdminError("La contraseña debe tener al menos 8 caracteres."); return; }

        setNewAdminSaving(true);
        const res  = await fetch("/api/admin/admins", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email: newAdminEmail.trim(), password: newAdminPassword }),
        });
        const json = await res.json();
        setNewAdminSaving(false);

        if (!res.ok) {
            setNewAdminError(json.error ?? "Error al crear administrador.");
        } else {
            setNewAdminEmail("");
            setNewAdminPassword("");
            setNewAdminOk(true);
            setTimeout(() => setNewAdminOk(false), 3000);
            await loadAdmins();
        }
    }, [newAdminEmail, newAdminPassword, loadAdmins]);

    // ── Delete admin ──────────────────────────────────────────────────────
    const handleDeleteAdmin = useCallback(async (id: string) => {
        setDeletingAdmin(id);
        await fetch(`/api/admin/admins/${id}`, { method: "DELETE" });
        setDeletingAdmin(null);
        setConfirmDeleteAdmin(null);
        await loadAdmins();
    }, [loadAdmins]);

    // ── Update tenant status ──────────────────────────────────────────────
    const handleTenantStatus = useCallback(async (id: string) => {
        if (!tenantActionStatus) return;
        setTenantActioning(true);
        await fetch(`/api/admin/tenants/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: tenantActionStatus }),
        });
        setTenantActioning(false);
        setTenantActionId(null);
        setTenantActionStatus("");
        await loadAll();
    }, [tenantActionStatus, loadAll]);

    // ── Styles ─────────────────────────────────────────────────────────────
    const inputCls = [
        "w-full h-8 px-3 rounded-lg border bg-surface-1 outline-none",
        "font-mono text-[11px] text-foreground",
        "border-border-light focus:border-primary-500/60",
        "transition-colors duration-150 placeholder:text-foreground/25",
    ].join(" ");

    const tabBtn = (active: boolean) => [
        "h-8 px-4 rounded-lg font-mono text-[10px] uppercase tracking-[0.18em] transition-colors duration-150 border",
        active
            ? "bg-primary-500/10 border-primary-500/20 text-primary-500"
            : "border-transparent text-foreground/40 hover:text-foreground hover:bg-foreground/[0.04]",
    ].join(" ");

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-surface-2 p-8 font-mono overflow-y-auto">
            <div className="max-w-[1000px] mx-auto space-y-6">

                {/* Header */}
                <header className="pb-4 border-b border-border-light">
                    <nav className="text-[10px] uppercase text-foreground/30 mb-1 tracking-widest">
                        Admin
                    </nav>
                    <h1 className="text-xl font-bold uppercase tracking-tighter text-foreground">
                        Panel de Administración
                    </h1>
                </header>

                {error ? (
                    <div className="px-4 py-4 border border-red-500/20 rounded-xl bg-red-500/[0.05]">
                        <p className="font-mono text-[12px] text-red-500">{error}</p>
                    </div>
                ) : loading ? (
                    <div className="flex items-center justify-center h-40 gap-2 border border-border-light rounded-xl">
                        <Spinner />
                        <span className="font-mono text-[11px] uppercase tracking-widest text-foreground/30">Cargando…</span>
                    </div>
                ) : (
                    <>
                        {/* KPI cards */}
                        {summary && (
                            <div className="grid grid-cols-4 gap-3">
                                {[
                                    { label: "Tenants",   value: summary.total_tenants },
                                    { label: "Activos",   value: summary.active_tenants },
                                    { label: "Pendientes pago", value: summary.pending_payments, highlight: summary.pending_payments > 0 },
                                    { label: "MRR (USD)", value: summary.mrr_usd != null ? `$${summary.mrr_usd}` : "—" },
                                ].map(({ label, value, highlight }) => (
                                    <div key={label} className={[
                                        "border rounded-xl px-4 py-3",
                                        highlight ? "border-amber-500/20 bg-amber-500/[0.04]" : "border-border-light bg-surface-1",
                                    ].join(" ")}>
                                        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 mb-1">{label}</p>
                                        <p className={[
                                            "font-mono text-[22px] font-bold tabular-nums",
                                            highlight ? "text-amber-500" : "text-foreground",
                                        ].join(" ")}>{value}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="flex items-center gap-1">
                            <button className={tabBtn(tab === "payments")} onClick={() => setTab("payments")}>
                                Solicitudes de pago
                                {(summary?.pending_payments ?? 0) > 0 && (
                                    <span className="ml-1.5 h-4 px-1.5 rounded bg-amber-500/20 text-amber-500 text-[9px] inline-flex items-center">
                                        {summary!.pending_payments}
                                    </span>
                                )}
                            </button>
                            <button className={tabBtn(tab === "tenants")} onClick={() => setTab("tenants")}>
                                Tenants
                            </button>
                            <button className={tabBtn(tab === "admins")} onClick={() => setTab("admins")}>
                                Administradores
                            </button>
                        </div>

                        {/* ── PAYMENTS TAB ───────────────────────────────────────── */}
                        {tab === "payments" && (
                            <div className="space-y-4">
                                {/* Filter */}
                                <div className="flex items-center gap-2">
                                    {(["", "pending", "approved", "rejected"] as const).map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setPayFilter(s)}
                                            className={[
                                                "h-7 px-3 rounded-lg border font-mono text-[9px] uppercase tracking-[0.15em] transition-colors",
                                                payFilter === s
                                                    ? "bg-foreground/[0.08] border-border-medium text-foreground"
                                                    : "border-border-light text-foreground/40 hover:text-foreground",
                                            ].join(" ")}
                                        >
                                            {s === "" ? "Todos" : STATUS_LABEL[s]}
                                        </button>
                                    ))}
                                </div>

                                {payments.length === 0 ? (
                                    <div className="border border-border-light rounded-xl px-4 py-10 text-center">
                                        <p className="font-mono text-[11px] text-foreground/25 uppercase tracking-widest">
                                            Sin solicitudes{payFilter ? ` ${STATUS_LABEL[payFilter].toLowerCase()}s` : ""}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="border border-border-light rounded-xl overflow-hidden bg-surface-1">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-border-light bg-surface-2">
                                                    {["Fecha", "Tenant", "Plan", "Ciclo", "Monto", "Método", "Estado", ""].map((h) => (
                                                        <th key={h} className="px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 whitespace-nowrap">
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {payments.map((pr) => {
                                                    const isExpanded = actionId === pr.id;
                                                    return (
                                                        <Fragment key={pr.id}>
                                                            <tr className="border-b border-border-light/60 last:border-b-0 hover:bg-foreground/[0.02] transition-colors">
                                                                <td className="px-3 py-3 font-mono text-[10px] text-foreground/50 whitespace-nowrap">
                                                                    {formatDate(pr.submitted_at)}
                                                                </td>
                                                                <td className="px-3 py-3 font-mono text-[10px] text-foreground/60 max-w-[120px] truncate" title={pr.tenant_id}>
                                                                    {pr.tenant_id.slice(0, 8)}…
                                                                </td>
                                                                <td className="px-3 py-3 font-mono text-[10px] text-foreground">
                                                                    {pr.tenants?.plans?.name ?? pr.plan_id.slice(0, 8)}
                                                                </td>
                                                                <td className="px-3 py-3 font-mono text-[10px] text-foreground/60">
                                                                    {CYCLE_LABEL[pr.billing_cycle] ?? pr.billing_cycle}
                                                                </td>
                                                                <td className="px-3 py-3 font-mono text-[11px] text-foreground tabular-nums font-medium">
                                                                    ${pr.amount_usd}
                                                                </td>
                                                                <td className="px-3 py-3 font-mono text-[10px] text-foreground/60 capitalize">
                                                                    {pr.payment_method}
                                                                </td>
                                                                <td className="px-3 py-3">
                                                                    <span className={[
                                                                        "h-5 px-2 rounded border font-mono text-[9px] uppercase tracking-[0.12em] inline-flex items-center",
                                                                        STATUS_CLS[pr.status] ?? "",
                                                                    ].join(" ")}>
                                                                        {STATUS_LABEL[pr.status] ?? pr.status}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-3 text-right">
                                                                    {pr.status === "pending" && (
                                                                        <button
                                                                            onClick={() => { setActionId(isExpanded ? null : pr.id); setActionNote(""); setActionError(null); }}
                                                                            className="h-6 px-2.5 rounded-md border border-border-light font-mono text-[9px] uppercase tracking-widest text-foreground/50 hover:text-foreground hover:border-border-medium transition-colors"
                                                                        >
                                                                            {isExpanded ? "Cerrar" : "Revisar"}
                                                                        </button>
                                                                    )}
                                                                    {pr.receipt_url && (
                                                                        <a href={pr.receipt_url} target="_blank" rel="noopener noreferrer"
                                                                            className="ml-1.5 h-6 px-2 rounded-md border border-border-light font-mono text-[9px] uppercase text-foreground/40 hover:text-foreground transition-colors inline-flex items-center">
                                                                            Ver
                                                                        </a>
                                                                    )}
                                                                </td>
                                                            </tr>

                                                            {/* Expanded review row */}
                                                            {isExpanded && (
                                                                <tr key={pr.id + "-review"} className="border-b border-border-light/60 bg-primary-500/[0.02]">
                                                                    <td colSpan={8} className="px-4 py-3">
                                                                        <div className="flex items-end gap-3">
                                                                            <div className="flex-1">
                                                                                <label className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 mb-1 block">
                                                                                    Nota (opcional)
                                                                                </label>
                                                                                <input
                                                                                    className={inputCls}
                                                                                    placeholder="Motivo de rechazo, observaciones…"
                                                                                    value={actionNote}
                                                                                    onChange={(e) => setActionNote(e.target.value)}
                                                                                />
                                                                            </div>
                                                                            <button
                                                                                onClick={() => handlePaymentAction(pr.id, "approve")}
                                                                                disabled={actioning}
                                                                                className="h-8 px-4 rounded-lg bg-green-500 text-white font-mono text-[10px] uppercase tracking-widest hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                                                                            >
                                                                                {actioning && <Spinner />}
                                                                                Aprobar
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handlePaymentAction(pr.id, "reject")}
                                                                                disabled={actioning}
                                                                                className="h-8 px-4 rounded-lg bg-red-500 text-white font-mono text-[10px] uppercase tracking-widest hover:bg-red-600 disabled:opacity-50 transition-colors"
                                                                            >
                                                                                Rechazar
                                                                            </button>
                                                                        </div>
                                                                        {actionError && (
                                                                            <p className="font-mono text-[10px] text-red-500 mt-2">{actionError}</p>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── TENANTS TAB ────────────────────────────────────────── */}
                        {tab === "tenants" && (
                            <div className="border border-border-light rounded-xl overflow-hidden bg-surface-1">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border-light bg-surface-2">
                                            {["Tenant ID", "Email", "Plan", "Estado", "Empresas", "Empleados", "Período fin", ""].map((h) => (
                                                <th key={h} className="px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tenants.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="px-4 py-10 text-center font-mono text-[11px] text-foreground/25 uppercase tracking-widest">
                                                    Sin tenants
                                                </td>
                                            </tr>
                                        ) : tenants.map((t) => {
                                            const isEditing = tenantActionId === t.tenant_id;
                                            return (
                                                <Fragment key={t.tenant_id}>
                                                    <tr className="border-b border-border-light/60 last:border-b-0 hover:bg-foreground/[0.02] transition-colors group">
                                                        <td className="px-3 py-3 font-mono text-[10px] text-foreground/50" title={t.tenant_id}>
                                                            {t.tenant_id.slice(0, 8)}…
                                                        </td>
                                                        <td className="px-3 py-3 font-mono text-[10px] text-foreground max-w-[160px] truncate">
                                                            {t.email ?? "—"}
                                                        </td>
                                                        <td className="px-3 py-3 font-mono text-[10px] text-foreground/70">
                                                            {t.plan_name ?? "—"}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <span className={[
                                                                "h-5 px-2 rounded border font-mono text-[9px] uppercase tracking-[0.12em] inline-flex items-center",
                                                                STATUS_CLS[t.status] ?? "",
                                                            ].join(" ")}>
                                                                {STATUS_LABEL[t.status] ?? t.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3 font-mono text-[11px] text-foreground/60 tabular-nums text-center">
                                                            {t.total_companies}
                                                        </td>
                                                        <td className="px-3 py-3 font-mono text-[11px] text-foreground/60 tabular-nums text-center">
                                                            {t.total_employees}
                                                        </td>
                                                        <td className="px-3 py-3 font-mono text-[10px] text-foreground/50">
                                                            {formatDate(t.current_period_end)}
                                                        </td>
                                                        <td className="px-3 py-3 text-right">
                                                            <button
                                                                onClick={() => { setTenantActionId(isEditing ? null : t.tenant_id); setTenantActionStatus(t.status); }}
                                                                className="h-6 px-2.5 rounded-md border border-border-light font-mono text-[9px] uppercase tracking-widest text-foreground/40 hover:text-foreground hover:border-border-medium transition-colors opacity-0 group-hover:opacity-100"
                                                            >
                                                                {isEditing ? "Cerrar" : "Editar"}
                                                            </button>
                                                        </td>
                                                    </tr>

                                                    {isEditing && (
                                                        <tr key={t.tenant_id + "-edit"} className="border-b border-border-light/60 bg-primary-500/[0.02]">
                                                            <td colSpan={8} className="px-4 py-3">
                                                                <div className="flex items-end gap-3">
                                                                    <div>
                                                                        <label className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 mb-1 block">
                                                                            Estado
                                                                        </label>
                                                                        <select
                                                                            value={tenantActionStatus}
                                                                            onChange={(e) => setTenantActionStatus(e.target.value)}
                                                                            className="h-8 px-2 rounded-lg border border-border-light bg-surface-1 font-mono text-[11px] text-foreground outline-none focus:border-primary-500/60"
                                                                        >
                                                                            <option value="active">Activo</option>
                                                                            <option value="suspended">Suspendido</option>
                                                                            <option value="trial">Prueba</option>
                                                                        </select>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleTenantStatus(t.tenant_id)}
                                                                        disabled={tenantActioning}
                                                                        className="h-8 px-4 rounded-lg bg-primary-500 text-white font-mono text-[10px] uppercase tracking-widest hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                                                                    >
                                                                        {tenantActioning && <Spinner />}
                                                                        Guardar
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setTenantActionId(null); setTenantActionStatus(""); }}
                                                                        className="h-8 px-3 rounded-lg border border-border-light font-mono text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground transition-colors"
                                                                    >
                                                                        Cancelar
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ── ADMINS TAB ─────────────────────────────────────────── */}
                        {tab === "admins" && (
                            <div className="space-y-5">

                                {/* Create form */}
                                <div className="border border-border-light rounded-xl bg-surface-1 divide-y divide-border-light/60">
                                    <div className="px-5 py-4">
                                        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-foreground">
                                            Nuevo administrador
                                        </h2>
                                        <p className="font-mono text-[9px] text-foreground/35 mt-0.5 uppercase tracking-widest">
                                            La cuenta se crea confirmada y lista para usar.
                                        </p>
                                    </div>

                                    <div className="px-5 py-4 space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 mb-1 block">
                                                    Correo electrónico
                                                </label>
                                                <input
                                                    type="email"
                                                    value={newAdminEmail}
                                                    onChange={(e) => setNewAdminEmail(e.target.value)}
                                                    placeholder="admin@ejemplo.com"
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div>
                                                <label className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 mb-1 block">
                                                    Contraseña
                                                </label>
                                                <input
                                                    type="password"
                                                    value={newAdminPassword}
                                                    onChange={(e) => setNewAdminPassword(e.target.value)}
                                                    placeholder="Mín. 8 caracteres"
                                                    className={inputCls}
                                                />
                                            </div>
                                        </div>

                                        {newAdminError && (
                                            <p className="font-mono text-[10px] text-red-500">{newAdminError}</p>
                                        )}
                                        {newAdminOk && (
                                            <p className="font-mono text-[10px] text-green-500">Administrador creado correctamente.</p>
                                        )}
                                    </div>

                                    <div className="px-5 py-3 flex justify-end">
                                        <button
                                            onClick={handleCreateAdmin}
                                            disabled={newAdminSaving}
                                            className={[
                                                "h-8 px-4 rounded-lg flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest",
                                                "bg-primary-500 text-white hover:bg-primary-600",
                                                "disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
                                            ].join(" ")}
                                        >
                                            {newAdminSaving && <Spinner />}
                                            {newAdminSaving ? "Creando…" : "Crear administrador"}
                                        </button>
                                    </div>
                                </div>

                                {/* Admin list */}
                                <div>
                                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 mb-2">
                                        Administradores actuales
                                    </p>

                                    {!adminsLoaded ? (
                                        <div className="flex items-center gap-2 justify-center h-20 border border-border-light rounded-xl">
                                            <Spinner />
                                            <span className="font-mono text-[10px] text-foreground/30 uppercase tracking-widest">Cargando…</span>
                                        </div>
                                    ) : admins.length === 0 ? (
                                        <div className="border border-border-light rounded-xl px-4 py-8 text-center">
                                            <p className="font-mono text-[11px] text-foreground/25 uppercase tracking-widest">Sin administradores</p>
                                        </div>
                                    ) : (
                                        <div className="border border-border-light rounded-xl overflow-hidden bg-surface-1">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="border-b border-border-light bg-surface-2">
                                                        {["Correo", "Creado", ""].map((h) => (
                                                            <th key={h} className="px-4 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35">
                                                                {h}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {admins.map((a) => (
                                                        <tr key={a.id} className="border-b border-border-light/60 last:border-b-0 hover:bg-foreground/[0.02] transition-colors group">
                                                            <td className="px-4 py-3 font-mono text-[12px] text-foreground">
                                                                {a.email}
                                                            </td>
                                                            <td className="px-4 py-3 font-mono text-[11px] text-foreground/40">
                                                                {formatDate(a.created_at)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                {confirmDeleteAdmin === a.id ? (
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <span className="font-mono text-[9px] text-red-500">¿Eliminar?</span>
                                                                        <button
                                                                            onClick={() => handleDeleteAdmin(a.id)}
                                                                            disabled={deletingAdmin === a.id}
                                                                            className="h-6 px-2 rounded-md bg-red-500 text-white font-mono text-[9px] uppercase hover:bg-red-600 disabled:opacity-50 transition-colors"
                                                                        >
                                                                            {deletingAdmin === a.id ? "…" : "Sí"}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setConfirmDeleteAdmin(null)}
                                                                            className="h-6 px-2 rounded-md border border-border-light font-mono text-[9px] uppercase text-foreground/40 hover:text-foreground transition-colors"
                                                                        >
                                                                            No
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setConfirmDeleteAdmin(a.id)}
                                                                        className="h-6 px-2.5 rounded-md border border-border-light font-mono text-[9px] uppercase tracking-widest text-foreground/30 hover:text-red-500 hover:border-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                                                                    >
                                                                        Eliminar
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
