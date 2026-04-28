"use client";

import { useCallback, useEffect, useState } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { Plus, UserCog, MailCheck, CheckCircle2, Copy } from "lucide-react";
import { notify } from "@/src/shared/frontend/notify";

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
        <span className={[
            "inline-flex items-center font-mono text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-[0.1em] border",
            role === "owner"
                ? "bg-primary-500/10 text-primary-500 border-primary-500/20"
                : "bg-surface-2 text-[var(--text-secondary)] border-border-light",
        ].join(" ")}>
            {role}
        </span>
    );
}

function PendingBadge() {
    return (
        <span className="inline-flex items-center font-mono text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-[0.1em] border badge-warning">
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
        try {
            const res  = await apiFetch("/api/memberships/members");
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? "Error al cargar miembros"); return; }
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
        if (!res.ok) { notify.error(json.error ?? "Error al revocar"); return; }
        fetchMembers();
    }

    const canInvite = activeTenantRole === "owner" || activeTenantRole === "admin";

    if (tenantLoading || activeTenantRole === "contable") return null;

    const accepted = members.filter((m) => !m.pending);
    const pending  = members.filter((m) => m.pending);

    const inviteButton = canInvite ? (
        <BaseButton.Root
            variant="primary"
            size="sm"
            onClick={() => setInviteOpen(true)}
            leftIcon={<Plus size={13} strokeWidth={2.5} />}
        >
            <span className="hidden sm:inline">Invitar miembro</span>
            <span className="sm:hidden">Invitar</span>
        </BaseButton.Root>
    ) : null;

    return (
        <div className="space-y-6">
            {isActingOnBehalf && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border-light bg-surface-1">
                    <UserCog size={13} className="text-[var(--text-tertiary)]" />
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                        Gestionando tenant de cliente
                    </p>
                </div>
            )}

            {loading ? (
                <SettingsSection
                    title="Miembros activos"
                    subtitle="Quienes tienen acceso al tenant. Sólo el owner y los admin pueden invitar o revocar."
                    action={inviteButton}
                    flush
                >
                    <div className="px-6 py-5 space-y-2">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-12 rounded-lg bg-surface-2/40 border border-border-light/60 animate-pulse" />
                        ))}
                    </div>
                </SettingsSection>
            ) : members.length === 0 ? (
                <SettingsSection
                    title="Miembros activos"
                    subtitle="Quienes tienen acceso al tenant."
                    action={inviteButton}
                >
                    <div className="text-center py-10">
                        <MailCheck size={20} className="mx-auto text-[var(--text-tertiary)] mb-2" />
                        <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
                            Aún no has invitado a nadie a tu tenant.
                        </p>
                    </div>
                </SettingsSection>
            ) : (
                <>
                    <SettingsSection
                        title="Miembros activos"
                        subtitle="Owner, admin y contables con acceso al tenant. El owner no puede revocarse."
                        action={inviteButton}
                        flush
                    >
                        {accepted.length > 0 ? (
                            <MembersTable
                                members={accepted}
                                canInvite={canInvite}
                                revoking={revoking}
                                onRevoke={(m) => handleRevoke(m)}
                            />
                        ) : (
                            <div className="px-6 py-8 text-center">
                                <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
                                    Aún no hay miembros activos. Las invitaciones pendientes están abajo.
                                </p>
                            </div>
                        )}
                    </SettingsSection>

                    {pending.length > 0 && (
                        <SettingsSection
                            title="Invitaciones pendientes"
                            subtitle="Enlaces enviados que aún no han sido aceptados. Puedes cancelarlos en cualquier momento."
                            flush
                        >
                            <MembersTable
                                members={pending}
                                canInvite={canInvite}
                                revoking={revoking}
                                onRevoke={(m) => handleRevoke(m)}
                            />
                        </SettingsSection>
                    )}
                </>
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
            <div className="sm:hidden divide-y divide-border-light">
                {members.map((m) => (
                    <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0 space-y-1">
                            <p className="font-mono text-[13px] text-foreground truncate">{m.email}</p>
                            <div className="flex items-center gap-2">
                                {m.pending ? <PendingBadge /> : <RoleBadge role={m.role} />}
                                {!m.pending && (
                                    <span className="font-mono text-[11px] text-[var(--text-tertiary)] tabular-nums">
                                        {new Date(m.acceptedAt ?? m.createdAt).toLocaleDateString("es-VE")}
                                    </span>
                                )}
                            </div>
                        </div>
                        {m.role !== "owner" && canInvite && (
                            <button
                                onClick={() => onRevoke(m)}
                                disabled={revoking === m.id}
                                className="font-mono text-[11px] uppercase tracking-[0.1em] font-bold text-text-error hover:text-text-error/80 disabled:opacity-40 transition-colors shrink-0 min-h-11 px-2"
                            >
                                {revoking === m.id ? "…" : "Revocar"}
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border-light bg-surface-2/30">
                            <th className={`text-left px-6 py-3 font-mono font-bold uppercase text-[var(--text-tertiary)] whitespace-nowrap ${APP_SIZES.text.tableHeader}`}>Email</th>
                            <th className={`text-left px-4 py-3 font-mono font-bold uppercase text-[var(--text-tertiary)] whitespace-nowrap ${APP_SIZES.text.tableHeader}`}>Rol</th>
                            <th className={`text-left px-4 py-3 font-mono font-bold uppercase text-[var(--text-tertiary)] whitespace-nowrap ${APP_SIZES.text.tableHeader}`}>Desde</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                        {members.map((m) => (
                            <tr key={m.id} className="hover:bg-surface-2/40 transition-colors">
                                <td className="px-6 py-3 font-mono text-[13px] text-foreground">{m.email}</td>
                                <td className="px-4 py-3">
                                    {m.pending ? <PendingBadge /> : <RoleBadge role={m.role} />}
                                </td>
                                <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-tertiary)] tabular-nums">
                                    {new Date(m.acceptedAt ?? m.createdAt).toLocaleDateString("es-VE")}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {m.role !== "owner" && canInvite && (
                                        <button
                                            onClick={() => onRevoke(m)}
                                            disabled={revoking === m.id}
                                            className="font-mono text-[11px] uppercase tracking-[0.1em] font-bold text-text-error hover:text-text-error/80 disabled:opacity-40 transition-colors"
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
    const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
    const [copied,    setCopied]    = useState(false);

    async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        const res  = await apiFetch("/api/memberships/invite", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email, role }),
        });
        const json = await res.json();
        setLoading(false);
        if (!res.ok) { notify.error(json.error ?? "Error al invitar"); return; }
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
                            <div className="w-10 h-10 rounded-full badge-success border flex items-center justify-center">
                                <CheckCircle2 size={18} strokeWidth={2} />
                            </div>
                            <div>
                                <p className="font-mono text-[13px] font-bold uppercase tracking-[0.1em] text-foreground">Invitación creada</p>
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-1">
                                    Comparte este enlace con <span className="text-foreground font-medium">{email}</span>
                                </p>
                            </div>
                        </div>

                        {/* Link copiable */}
                        <div className="rounded-lg border border-border-light bg-surface-2 p-3 space-y-2">
                            <p className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.14em]">Enlace de invitación</p>
                            <p className="font-mono text-[11px] text-foreground break-all leading-relaxed">{acceptUrl}</p>
                            <button
                                onClick={handleCopy}
                                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] font-bold text-primary-500 hover:text-primary-600 transition-colors"
                            >
                                {copied ? <CheckCircle2 size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2} />}
                                {copied ? "Copiado" : "Copiar enlace"}
                            </button>
                        </div>

                        <BaseButton.Root variant="primary" size="md" onClick={onSuccess} fullWidth>
                            Listo
                        </BaseButton.Root>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <BaseInput.Field
                            label="Email"
                            type="email"
                            isRequired
                            value={email}
                            onValueChange={setEmail}
                            placeholder="correo@ejemplo.com"
                        />
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
