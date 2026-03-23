"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Member {
    id:         string;
    memberId:   string | null;
    email:      string;
    role:       "owner" | "admin" | "contable";
    acceptedAt: string | null;
    createdAt:  string;
    pending:    boolean;
    expiresAt?: string;
}

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Member["role"] }) {
    return (
        <span className={`inline-block font-mono text-xs px-2 py-0.5 rounded uppercase ${
            role === "owner"
                ? "bg-primary-500/10 text-primary-400"
                : "bg-foreground/6 text-foreground/60"
        }`}>
            {role}
        </span>
    );
}

function PendingBadge() {
    return (
        <span className="inline-block font-mono text-xs px-2 py-0.5 rounded uppercase bg-yellow-500/10 text-yellow-500">
            Pendiente
        </span>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MembersPage() {
    const router = useRouter();
    const { activeTenantRole, isActingOnBehalf, loading: tenantLoading } = useActiveTenantContext();

    const [members,    setMembers]    = useState<Member[]>([]);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState<string | null>(null);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [revoking,   setRevoking]   = useState<string | null>(null);

    // Redirect contables away
    useEffect(() => {
        if (tenantLoading) return;
        if (activeTenantRole === "contable") router.replace("/");
    }, [activeTenantRole, tenantLoading, router]);

    const fetchMembers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res  = await apiFetch("/api/memberships/members");
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? "Error al cargar miembros"); return; }
            setMembers(json.data ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!tenantLoading) fetchMembers();
    }, [tenantLoading, fetchMembers]);

    async function handleRevoke(memberRowId: string) {
        if (!confirm("¿Revocar acceso a este miembro?")) return;
        setRevoking(memberRowId);
        const res  = await apiFetch(`/api/memberships/${memberRowId}`, { method: "DELETE" });
        const json = await res.json();
        setRevoking(null);
        if (!res.ok) { alert(json.error ?? "Error al revocar"); return; }
        fetchMembers();
    }

    const canInvite = activeTenantRole === "owner" || activeTenantRole === "admin";

    if (tenantLoading || activeTenantRole === "contable") return null;

    const accepted = members.filter((m) => !m.pending);
    const pending  = members.filter((m) => m.pending);

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full min-h-full">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="font-mono text-sm font-semibold text-foreground">Miembros</h1>
                    {isActingOnBehalf && (
                        <p className="font-mono text-xs text-foreground/40 mt-0.5">
                            Gestionando tenant de cliente
                        </p>
                    )}
                </div>
                {canInvite && (
                    <button
                        onClick={() => setInviteOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-mono text-xs transition-colors min-h-11"
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <path d="M6 1v10M1 6h10" />
                        </svg>
                        <span className="hidden sm:inline">Invitar miembro</span>
                        <span className="sm:hidden">Invitar</span>
                    </button>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/5 border border-red-500/20 text-red-500 font-mono text-xs">
                    {error}
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-16 rounded-lg bg-foreground/4 animate-pulse" />
                    ))}
                </div>
            ) : members.length === 0 ? (
                <p className="font-mono text-xs text-foreground/40 px-1">Sin miembros aún.</p>
            ) : (
                <div className="space-y-6">
                    {/* Accepted members */}
                    {accepted.length > 0 && (
                        <MembersTable
                            members={accepted}
                            canInvite={canInvite}
                            revoking={revoking}
                            onRevoke={handleRevoke}
                        />
                    )}

                    {/* Pending invitations */}
                    {pending.length > 0 && (
                        <div>
                            <p className="font-mono text-xs text-foreground/40 mb-2 px-1">
                                Invitaciones pendientes
                            </p>
                            <MembersTable
                                members={pending}
                                canInvite={canInvite}
                                revoking={revoking}
                                onRevoke={handleRevoke}
                            />
                        </div>
                    )}
                </div>
            )}

            {inviteOpen && (
                <InviteModal
                    canInviteAdmin={activeTenantRole === "owner"}
                    onClose={() => setInviteOpen(false)}
                    onSuccess={() => { setInviteOpen(false); fetchMembers(); }}
                />
            )}
        </div>
    );
}

// ── Members table (shared for accepted + pending) ─────────────────────────────

function MembersTable({
    members,
    canInvite,
    revoking,
    onRevoke,
}: {
    members:  Member[];
    canInvite: boolean;
    revoking:  string | null;
    onRevoke:  (id: string) => void;
}) {
    return (
        <>
            {/* Mobile: card list */}
            <div className="sm:hidden space-y-2">
                {members.map((m) => (
                    <div key={m.id} className="rounded-lg border border-border-light bg-surface-1 px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0 space-y-1">
                            <p className="font-mono text-xs text-foreground truncate">{m.email}</p>
                            <div className="flex items-center gap-2">
                                {m.pending ? <PendingBadge /> : <RoleBadge role={m.role} />}
                                {!m.pending && (
                                    <span className="font-mono text-xs text-foreground/30">
                                        {new Date(m.acceptedAt ?? m.createdAt).toLocaleDateString("es-VE")}
                                    </span>
                                )}
                            </div>
                        </div>
                        {m.role !== "owner" && canInvite && (
                            <button
                                onClick={() => onRevoke(m.id)}
                                disabled={revoking === m.id}
                                className="font-mono text-xs text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors shrink-0 min-h-11 px-1"
                            >
                                {revoking === m.id ? "…" : "Revocar"}
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden sm:block rounded-lg border border-border-light overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border-light bg-surface-2">
                            <th className="text-left px-4 py-2.5 font-mono text-xs text-foreground/40 font-medium">Email</th>
                            <th className="text-left px-4 py-2.5 font-mono text-xs text-foreground/40 font-medium">Rol</th>
                            <th className="text-left px-4 py-2.5 font-mono text-xs text-foreground/40 font-medium">Desde</th>
                            <th className="px-4 py-2.5" />
                        </tr>
                    </thead>
                    <tbody>
                        {members.map((m) => (
                            <tr key={m.id} className="border-b border-border-light last:border-0">
                                <td className="px-4 py-3 font-mono text-xs text-foreground">{m.email}</td>
                                <td className="px-4 py-3">
                                    {m.pending ? <PendingBadge /> : <RoleBadge role={m.role} />}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-foreground/40">
                                    {new Date(m.acceptedAt ?? m.createdAt).toLocaleDateString("es-VE")}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {m.role !== "owner" && canInvite && (
                                        <button
                                            onClick={() => onRevoke(m.id)}
                                            disabled={revoking === m.id}
                                            className="font-mono text-xs text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                                        >
                                            {revoking === m.id ? "Revocando…" : "Revocar"}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// ── Invite Modal ──────────────────────────────────────────────────────────────

function InviteModal({
    canInviteAdmin,
    onClose,
    onSuccess,
}: {
    canInviteAdmin: boolean;
    onClose:        () => void;
    onSuccess:      () => void;
}) {
    const [email,   setEmail]   = useState("");
    const [role,    setRole]    = useState("contable");
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const [sent,    setSent]    = useState(false);

    async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const res  = await apiFetch("/api/memberships/invite", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email, role }),
        });
        const json = await res.json();
        setLoading(false);
        if (!res.ok) { setError(json.error ?? "Error al invitar"); return; }
        setSent(true);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
            <div className="bg-surface-1 rounded-xl border border-border-light shadow-xl w-full max-w-sm p-6">
                <h2 className="font-mono text-sm font-semibold text-foreground mb-4">Invitar miembro</h2>

                {sent ? (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500" aria-hidden="true">
                                    <path d="M3 9.5l4 4 8-8" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-mono text-sm font-semibold text-foreground">Invitación enviada</p>
                                <p className="font-mono text-xs text-foreground/50 mt-1">
                                    Le enviamos un email a <span className="text-foreground/80">{email}</span> con el enlace para unirse.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onSuccess}
                            className="w-full py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-mono text-xs transition-colors"
                        >
                            Listo
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <p className="font-mono text-xs text-red-500">{error}</p>
                        )}
                        <div>
                            <label className="block font-mono text-xs text-foreground/60 mb-1.5">Email</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="correo@ejemplo.com"
                                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-border-light font-mono text-xs text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                            />
                        </div>
                        <div>
                            <label className="block font-mono text-xs text-foreground/60 mb-1.5">Rol</label>
                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-border-light font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                            >
                                {canInviteAdmin && <option value="admin">Admin</option>}
                                <option value="contable">Contable</option>
                            </select>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-2.5 rounded-lg border border-border-light font-mono text-xs text-foreground/60 hover:text-foreground transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-mono text-xs transition-colors"
                            >
                                {loading ? "Enviando…" : "Enviar invitación"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
