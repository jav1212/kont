"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

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
    const [inviteOpen,    setInviteOpen]    = useState(false);
    const [revoking,      setRevoking]      = useState<string | null>(null);
    const [revokeTarget,  setRevokeTarget]  = useState<Member | null>(null);

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

    async function handleRevoke(member: Member) {
        setRevokeTarget(member);
    }

    async function confirmRevoke() {
        if (!revokeTarget) return;
        const id = revokeTarget.id;
        setRevoking(id);
        setRevokeTarget(null);
        const res  = await apiFetch(`/api/memberships/${id}`, { method: "DELETE" });
        const json = await res.json();
        setRevoking(null);
        if (!res.ok) { setError(json.error ?? "Error al revocar"); return; }
        fetchMembers();
    }

    const canInvite = activeTenantRole === "owner" || activeTenantRole === "admin";

    if (tenantLoading || activeTenantRole === "contable") return null;

    const accepted = members.filter((m) => !m.pending);
    const pending  = members.filter((m) => m.pending);

    return (
        <div className="w-full min-h-full">

            {/* Header (Action bar) */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    {isActingOnBehalf && (
                        <p className="font-mono text-xs text-foreground/40 mt-0.5">
                            Gestionando tenant de cliente
                        </p>
                    )}
                </div>
                {canInvite && (
                    <BaseButton.Root
                        variant="primary"
                        size="sm"
                        onClick={() => setInviteOpen(true)}
                        leftIcon={
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                <path d="M6 1v10M1 6h10" />
                            </svg>
                        }
                    >
                        <span className="hidden sm:inline">Invitar miembro</span>
                        <span className="sm:hidden">Invitar</span>
                    </BaseButton.Root>
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
                        <div key={i} className="h-16 rounded-xl bg-surface-1 border border-border-light animate-pulse" />
                    ))}
                </div>
            ) : members.length === 0 ? (
                <p className="font-mono text-xs text-[var(--text-tertiary)] px-1">Sin miembros aún.</p>
            ) : (
                <div className="space-y-6">
                    {/* Accepted members */}
                    {accepted.length > 0 && (
                        <MembersTable
                            members={accepted}
                            canInvite={canInvite}
                            revoking={revoking}
                            onRevoke={(m) => handleRevoke(m)}
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
                                onRevoke={(m) => handleRevoke(m)}
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

            {revokeTarget && (
                <RevokeConfirmDialog
                    member={revokeTarget}
                    onCancel={() => setRevokeTarget(null)}
                    onConfirm={confirmRevoke}
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
    onRevoke:  (member: Member) => void;
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
                                onClick={() => onRevoke(m)}
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
            <div className="hidden sm:block rounded-xl border border-border-light overflow-hidden bg-surface-1">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border-light">
                                <th className={`text-left px-4 py-3 font-mono uppercase text-[var(--text-tertiary)] whitespace-nowrap ${APP_SIZES.text.tableHeader}`}>Email</th>
                                <th className={`text-left px-4 py-3 font-mono uppercase text-[var(--text-tertiary)] whitespace-nowrap ${APP_SIZES.text.tableHeader}`}>Rol</th>
                                <th className={`text-left px-4 py-3 font-mono uppercase text-[var(--text-tertiary)] whitespace-nowrap ${APP_SIZES.text.tableHeader}`}>Desde</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((m) => (
                                <tr key={m.id} className="border-b border-border-light last:border-0 hover:bg-foreground/[0.02] transition-colors">
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
                                            onClick={() => onRevoke(m)}
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
            </div>
        </>
    );
}

// ── Revoke Confirm Dialog ─────────────────────────────────────────────────────

function RevokeConfirmDialog({
    member,
    onCancel,
    onConfirm,
}: {
    member:    Member;
    onCancel:  () => void;
    onConfirm: () => void;
}) {
    const label = member.pending ? "invitación" : "acceso";
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
            <div className="bg-surface-1 rounded-xl border border-border-light shadow-xl w-full max-w-sm p-6">
                <h2 className="font-mono text-sm font-semibold text-foreground mb-1">
                    {member.pending ? "Cancelar invitación" : "Revocar acceso"}
                </h2>
                <p className="font-mono text-xs text-foreground/50 mb-5">
                    Se revocará el {label} de{" "}
                    <span className="text-foreground/80">{member.email}</span>.
                    Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-2">
                    <BaseButton.Root type="button" variant="outline" size="md" onClick={onCancel} fullWidth>
                        Cancelar
                    </BaseButton.Root>
                    <BaseButton.Root type="button" variant="danger" size="md" onClick={onConfirm} fullWidth>
                        {member.pending ? "Cancelar invitación" : "Revocar"}
                    </BaseButton.Root>
                </div>
            </div>
        </div>
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
    const [email,     setEmail]     = useState("");
    const [role,      setRole]      = useState("contable");
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState<string | null>(null);
    const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
    const [copied,    setCopied]    = useState(false);

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
        setAcceptUrl(json.data?.acceptUrl ?? null);
    }

    async function handleCopy() {
        if (!acceptUrl) return;
        await navigator.clipboard.writeText(acceptUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
            <div className="bg-surface-1 rounded-xl border border-border-light shadow-xl w-full max-w-sm p-6">
                <h2 className="font-mono text-sm font-semibold text-foreground mb-4">Invitar miembro</h2>

                {acceptUrl ? (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center gap-3 py-2 text-center">
                            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500" aria-hidden="true">
                                    <path d="M3 9.5l4 4 8-8" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-mono text-sm font-semibold text-foreground">Invitación creada</p>
                                <p className="font-mono text-xs text-foreground/50 mt-1">
                                    Comparte este enlace con <span className="text-foreground/80">{email}</span>
                                </p>
                            </div>
                        </div>

                        {/* Link copiable */}
                        <div className="rounded-lg border border-border-light bg-surface-2 p-3 space-y-2">
                            <p className="font-mono text-[10px] text-foreground/30 uppercase tracking-widest">Enlace de invitación</p>
                            <p className="font-mono text-[10px] text-foreground/70 break-all leading-relaxed">{acceptUrl}</p>
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 font-mono text-[10px] text-primary-400 hover:text-primary-300 transition-colors"
                            >
                                {copied ? (
                                    <>
                                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6.5l3 3 5-6"/></svg>
                                        Copiado
                                    </>
                                ) : (
                                    <>
                                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><path d="M1 8V2a1 1 0 0 1 1-1h6"/></svg>
                                        Copiar enlace
                                    </>
                                )}
                            </button>
                        </div>

                        <BaseButton.Root variant="primary" size="md" onClick={onSuccess} fullWidth>
                            Listo
                        </BaseButton.Root>
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
                            <BaseButton.Root type="button" variant="outline" size="md" onClick={onClose} fullWidth>
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root type="submit" variant="primary" size="md" isDisabled={loading} loading={loading} fullWidth>
                                {loading ? "Enviando…" : "Enviar invitación"}
                            </BaseButton.Root>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
