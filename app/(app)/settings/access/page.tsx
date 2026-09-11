"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Printer, ScanBarcode, ShieldOff, Terminal } from "lucide-react";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { notify } from "@/src/shared/frontend/notify";
import { Code128Barcode } from "@/src/modules/auth/frontend/components/code128-barcode";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";

interface TerminalEntry { id: string; name: string; status: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }
interface BadgeEntry { id: string; userId: string; email: string | null; status: string; createdAt: string; revokedAt: string | null }
interface Member { id: string; memberId: string | null; email: string; pending: boolean }
interface IssuedBadge { badge: BadgeEntry; barcode: string }

/** Manages browser terminals and one-time printable access credentials. */
export default function AccessSettingsPage() {
    const { activeTenantId, activeTenantRole } = useActiveTenantContext();
    const { state: accessState, can } = useOrganizationModuleAccess("/settings/access");
    const { user } = useAuth();
    const [terminals, setTerminals] = useState<TerminalEntry[]>([]);
    const [badges, setBadges] = useState<BadgeEntry[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [terminalName, setTerminalName] = useState("");
    const [memberId, setMemberId] = useState("");
    const [issued, setIssued] = useState<IssuedBadge | null>(null);
    const [working, setWorking] = useState<string | null>(null);
    const permitted = can("access.manage");

    const reload = useCallback(async () => {
        if (!activeTenantId || !permitted) return;
        setLoading(true);
        try {
            const [terminalsResponse, badgesResponse, membersResponse] = await Promise.all([
                apiFetch("/api/access/terminals"), apiFetch("/api/access/badges"), apiFetch("/api/memberships/members"),
            ]);
            const [terminalBody, badgeBody, memberBody] = await Promise.all([
                terminalsResponse.json(), badgesResponse.json(), membersResponse.json(),
            ]) as Array<{ data?: { terminals?: TerminalEntry[]; badges?: BadgeEntry[] } | Member[] }>;
            if (!terminalsResponse.ok || !badgesResponse.ok) {
                notify.error("No se pudo cargar la configuración de acceso.");
                return;
            }
            setTerminals((terminalBody.data as { terminals?: TerminalEntry[] } | undefined)?.terminals ?? []);
            setBadges((badgeBody.data as { badges?: BadgeEntry[] } | undefined)?.badges ?? []);
            const listedMembers = membersResponse.ok ? ((memberBody.data as Member[] | undefined) ?? []).filter((member) => !member.pending) : [];
            if (activeTenantRole === "owner" && user && !listedMembers.some((member) => (member.memberId ?? member.id) === user.id)) {
                listedMembers.unshift({ id: user.id, memberId: user.id, email: user.email, pending: false });
            }
            setMembers(listedMembers);
        } catch { notify.error("No se pudo conectar con el servidor."); }
        finally { setLoading(false); }
    }, [activeTenantId, activeTenantRole, permitted, user]);

    useEffect(() => { if (accessState === "allowed") void reload(); }, [reload, accessState]);

    async function installTerminal() {
        const name = terminalName.trim();
        if (!name) { notify.error("Asigna un nombre a esta terminal."); return; }
        setWorking("terminal");
        try {
            const response = await apiFetch("/api/access/terminals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, install: true }) });
            const body = await response.json() as { error?: string };
            if (!response.ok) { notify.error(body.error ?? "No se pudo habilitar la terminal."); return; }
            setTerminalName(""); notify.success("Terminal habilitada en este navegador."); await reload();
        } finally { setWorking(null); }
    }

    async function issueBadge() {
        if (!memberId) { notify.error("Selecciona un miembro."); return; }
        setWorking("badge");
        try {
            const response = await apiFetch("/api/access/badges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: memberId }) });
            const body = await response.json() as { data?: IssuedBadge; error?: string };
            if (!response.ok || !body.data) { notify.error(body.error ?? "No se pudo emitir el carnet."); return; }
            setIssued(body.data); setMemberId(""); await reload();
        } finally { setWorking(null); }
    }

    async function revoke(kind: "terminal" | "badge", id: string) {
        if (!window.confirm("¿Revocar este acceso? Las sesiones vinculadas dejarán de funcionar.")) return;
        setWorking(id);
        try {
            const response = await apiFetch(`/api/access/${kind}s/${id}/revoke`, { method: "POST" });
            const body = await response.json() as { error?: string };
            if (!response.ok) { notify.error(body.error ?? "No se pudo revocar."); return; }
            await reload();
        } finally { setWorking(null); }
    }

    if (accessState !== "allowed" || !permitted) return null;
    return <div className="space-y-6">
        <SettingsSection title="Terminales de acceso" subtitle="Habilita este navegador para que los carnets puedan iniciar sesión." flush>
            <div className="flex flex-col gap-3 border-b border-border-light p-5 sm:flex-row">
                <BaseInput.Field label="Nombre de esta terminal" value={terminalName} onValueChange={setTerminalName} placeholder="Caja principal" />
                <BaseButton.Root className="self-end" variant="primary" disabled={working === "terminal"} onClick={() => void installTerminal()} leftIcon={<Terminal size={14} />}>
                    Habilitar este navegador
                </BaseButton.Root>
            </div>
            <AccessRows entries={terminals} empty="No hay terminales habilitadas." working={working} onRevoke={(id) => void revoke("terminal", id)} />
        </SettingsSection>

        <SettingsSection title="Carnets de acceso" subtitle="Emite un carnet por miembro. El código sólo se muestra una vez; imprímelo o entrégalo de inmediato." flush>
            <div className="flex flex-col gap-3 border-b border-border-light p-5 sm:flex-row">
                <label className="flex-1 font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary">Miembro
                    <select className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-surface-1 px-3 font-sans text-sm text-foreground" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                        <option value="">Selecciona un miembro</option>
                        {members.map((member) => <option key={member.memberId ?? member.id} value={member.memberId ?? member.id}>{member.email}</option>)}
                    </select>
                </label>
                <BaseButton.Root className="self-end" variant="primary" disabled={working === "badge"} onClick={() => void issueBadge()} leftIcon={<Plus size={14} />}>Emitir carnet</BaseButton.Root>
            </div>
            <AccessRows entries={badges} empty="No hay carnets emitidos." working={working} onRevoke={(id) => void revoke("badge", id)} />
        </SettingsSection>

        {issued && <IssuedBadgeCard issued={issued} onClose={() => setIssued(null)} />}
        {loading && <p className="font-sans text-sm text-text-tertiary">Cargando accesos…</p>}
    </div>;
}

function AccessRows({ entries, empty, working, onRevoke }: { entries: Array<TerminalEntry | BadgeEntry>; empty: string; working: string | null; onRevoke: (id: string) => void }) {
    if (!entries.length) return <p className="p-6 text-sm text-text-tertiary">{empty}</p>;
    return <ul className="divide-y divide-border-light">{entries.map((entry) => <li key={entry.id} className="flex items-center gap-3 p-4">
        <ScanBarcode className="h-4 w-4 shrink-0 text-primary-500" aria-hidden />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{"email" in entry ? entry.email : entry.name}</p><p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">{entry.status}{"lastUsedAt" in entry && entry.lastUsedAt ? ` · Último uso ${new Date(entry.lastUsedAt).toLocaleDateString("es-VE")}` : ""}</p></div>
        {entry.status !== "revoked" && <BaseButton.Root size="sm" variant="ghost" disabled={working === entry.id} onClick={() => onRevoke(entry.id)} leftIcon={<ShieldOff size={13} />}>Revocar</BaseButton.Root>}
    </li>)}</ul>;
}

function IssuedBadgeCard({ issued, onClose }: { issued: IssuedBadge; onClose: () => void }) {
    async function copy() { await navigator.clipboard.writeText(issued.barcode); notify.success("Código copiado."); }
    return <section id="kont-issued-badge" className="rounded-xl border-2 border-primary-500/30 bg-surface-1 p-6 print:border-0" aria-live="polite">
        <style>{"@media print { body * { visibility: hidden !important; } #kont-issued-badge, #kont-issued-badge * { visibility: visible !important; } #kont-issued-badge { position: fixed; inset: 18mm; border: 0 !important; } }"}</style>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-primary-500">Carnet emitido</p>
        <h2 className="mt-2 text-lg font-semibold">Carnet de acceso</h2>
        <p className="mt-1 text-sm text-text-tertiary">Titular: {issued.badge.email ?? "Usuario de Kontave"}</p>
        <div className="my-5 rounded-lg border border-border-light bg-white px-4 py-6 text-center text-black">
            <Code128Barcode value={issued.barcode} />
            <div className="select-all break-all font-mono text-xl font-bold tracking-[0.16em]">{issued.barcode}</div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em]">Escanear con lector configurado como teclado</p>
        </div>
        <div className="flex gap-2 print:hidden"><BaseButton.Root variant="secondary" onClick={() => void copy()} leftIcon={<Copy size={13} />}>Copiar</BaseButton.Root><BaseButton.Root variant="primary" onClick={() => window.print()} leftIcon={<Printer size={13} />}>Imprimir</BaseButton.Root><BaseButton.Root variant="ghost" onClick={onClose}>Cerrar</BaseButton.Root></div>
    </section>;
}
