"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, ScanBarcode, ShieldOff, Terminal } from "lucide-react";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { notify } from "@/src/shared/frontend/notify";
import { IssuedBadgeCard } from "@/src/modules/auth/frontend/components/issued-badge-card";
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
    const issuedBadgeRef = useRef<HTMLDivElement>(null);
    const mutationInFlight = useRef(false);
    const reloadRequestId = useRef(0);
    const reloadAbortController = useRef<AbortController | null>(null);
    const mounted = useRef(false);
    const activeScope = useRef("");
    const permitted = can("access.manage");
    const userId = user?.id ?? null;
    const userEmail = user?.email ?? null;
    const scope = `${activeTenantId ?? ""}:${activeTenantRole ?? ""}:${permitted}:${userId ?? ""}`;
    const issuingBadge = working === "badge-issue" || working?.startsWith("badge-reissue-") === true;

    useEffect(() => {
        mounted.current = true;
        activeScope.current = scope;
        return () => {
            mounted.current = false;
            activeScope.current = "";
        };
    }, [scope]);

    const reload = useCallback(async () => {
        if (!mounted.current || activeScope.current !== scope || !activeTenantId || !permitted) return;
        reloadAbortController.current?.abort();
        const controller = new AbortController();
        reloadAbortController.current = controller;
        const requestId = ++reloadRequestId.current;
        const isCurrent = () => requestId === reloadRequestId.current
            && !controller.signal.aborted
            && mounted.current
            && activeScope.current === scope;
        setLoading(true);
        try {
            const [terminalsResponse, badgesResponse, membersResponse] = await Promise.all([
                apiFetch("/api/access/terminals", { signal: controller.signal }), apiFetch("/api/access/badges", { signal: controller.signal }), apiFetch("/api/memberships/members", { signal: controller.signal }),
            ]);
            const [terminalBody, badgeBody, memberBody] = await Promise.all([
                terminalsResponse.json(), badgesResponse.json(), membersResponse.json(),
            ]) as Array<{ data?: { terminals?: TerminalEntry[]; badges?: BadgeEntry[] } | Member[] }>;
            if (!isCurrent()) return;
            if (!terminalsResponse.ok || !badgesResponse.ok) {
                notify.error("No se pudo cargar la configuración de acceso.");
                return;
            }
            setTerminals((terminalBody.data as { terminals?: TerminalEntry[] } | undefined)?.terminals ?? []);
            setBadges((badgeBody.data as { badges?: BadgeEntry[] } | undefined)?.badges ?? []);
            const listedMembers = membersResponse.ok ? ((memberBody.data as Member[] | undefined) ?? []).filter((member) => !member.pending) : [];
            if (activeTenantRole === "owner" && userId && !listedMembers.some((member) => (member.memberId ?? member.id) === userId)) {
                listedMembers.unshift({ id: userId, memberId: userId, email: userEmail ?? userId, pending: false });
            }
            setMembers(listedMembers);
        } catch {
            if (isCurrent()) notify.error("No se pudo conectar con el servidor.");
        } finally {
            if (isCurrent()) setLoading(false);
        }
    }, [activeTenantId, activeTenantRole, permitted, scope, userEmail, userId]);

    useEffect(() => {
        if (accessState === "allowed") void reload();
        return () => {
            reloadRequestId.current += 1;
            reloadAbortController.current?.abort();
            reloadAbortController.current = null;
        };
    }, [reload, accessState]);

    useEffect(() => {
        if (!issued) return;
        issuedBadgeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        issuedBadgeRef.current?.focus({ preventScroll: true });
    }, [issued]);

    async function installTerminal() {
        if (mutationInFlight.current) return;
        const name = terminalName.trim();
        if (!name) { notify.error("Asigna un nombre a esta terminal."); return; }
        mutationInFlight.current = true;
        setWorking("terminal");
        try {
            const response = await apiFetch("/api/access/terminals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, install: true }) });
            const body = await response.json() as { data?: { terminal?: TerminalEntry }; error?: string };
            if (!response.ok) { notify.error(body.error ?? "No se pudo habilitar la terminal."); return; }
            setTerminalName("");
            try {
                const verificationResponse = await fetch("/api/auth/barcode/session", { cache: "no-store" });
                const verification = await verificationResponse.json() as { data?: { terminal?: { ready?: boolean; id?: string; reason?: string } } };
                if (!verificationResponse.ok || verification.data?.terminal?.reason === "access_unavailable") {
                    notify.error("La terminal se registró, pero no pudimos verificar este navegador. Intenta nuevamente.");
                } else if (body.data?.terminal?.id && verification.data?.terminal?.ready && verification.data.terminal.id === body.data.terminal.id) {
                    notify.success("Terminal habilitada en este navegador.");
                } else {
                    notify.error("La terminal se registró, pero este navegador no conservó la habilitación. Comprueba que permita cookies y vuelve a habilitarlo.");
                }
            } catch {
                notify.error("La terminal se registró, pero no pudimos verificar este navegador. Intenta nuevamente.");
            }
            await reload();
        } catch {
            notify.error("No se pudo conectar con el servidor.");
        } finally { mutationInFlight.current = false; setWorking(null); }
    }

    async function issueBadge(userId: string, reissueBadge?: BadgeEntry) {
        if (mutationInFlight.current) return;
        if (!userId) { notify.error("Selecciona un miembro."); return; }
        const existingBadge = badges.find((badge) => badge.userId === userId && badge.status === "active");
        const holder = reissueBadge?.email ?? members.find((member) => (member.memberId ?? member.id) === userId)?.email ?? "este miembro";
        const isReissue = Boolean(reissueBadge);
        if (isReissue && !window.confirm(`¿Reemitir el carnet de ${holder}? El carnet anterior y sus sesiones dejarán de funcionar.`)) return;
        if (!isReissue && existingBadge && !window.confirm(`Este miembro ya tiene un carnet activo. Al emitir uno nuevo, el carnet anterior y sus sesiones dejarán de funcionar. ¿Continuar?`)) return;
        mutationInFlight.current = true;

        // The former barcode may already be revoked if the request reached the server,
        // even when the response is lost. Never keep a potentially invalid preview.
        setIssued(null);
        setWorking(reissueBadge ? `badge-reissue-${reissueBadge.id}` : "badge-issue");
        try {
            const response = await apiFetch("/api/access/badges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
            const body = await response.json() as { data?: IssuedBadge; error?: string };
            if (!response.ok || !body.data) { notify.error(body.error ?? "No se pudo emitir el carnet."); return; }
            setIssued(body.data);
            setMemberId("");
            await reload();
        } catch {
            notify.error("No se pudo conectar con el servidor. El carnet anterior podría haber sido invalidado; verifica el listado antes de intentar nuevamente.");
        } finally { mutationInFlight.current = false; setWorking(null); }
    }

    async function revoke(kind: "terminal" | "badge", id: string) {
        if (mutationInFlight.current) return;
        if (!window.confirm("¿Revocar este acceso? Las sesiones vinculadas dejarán de funcionar.")) return;
        mutationInFlight.current = true;
        setWorking(id);
        try {
            const response = await apiFetch(`/api/access/${kind}s/${id}/revoke`, { method: "POST" });
            const body = await response.json() as { error?: string };
            if (!response.ok) { notify.error(body.error ?? "No se pudo revocar."); return; }
            await reload();
        } finally { mutationInFlight.current = false; setWorking(null); }
    }

    if (accessState !== "allowed" || !permitted) return null;
    return <div className="space-y-6">
        <SettingsSection title="Terminales de acceso" subtitle="Habilita este navegador para que los carnets puedan iniciar sesión." flush>
            <div className="grid grid-cols-1 items-end gap-3 border-b border-border-light p-5 xl:grid-cols-[minmax(0,1fr)_auto]">
                <BaseInput.Field className="min-w-0" label="Nombre de esta terminal" value={terminalName} onValueChange={setTerminalName} placeholder="Caja principal" />
                <BaseButton.Root className="h-auto min-h-10 w-full shrink-0 whitespace-normal px-4 py-2 xl:w-auto [&>span]:whitespace-normal" variant="primary" isDisabled={working !== null} loading={working === "terminal"} onClick={() => void installTerminal()} leftIcon={<Terminal size={14} />}>
                    Habilitar este navegador
                </BaseButton.Root>
            </div>
            <AccessRows entries={terminals} empty="No hay terminales habilitadas." working={working} onRevoke={(id) => void revoke("terminal", id)} />
        </SettingsSection>

        <SettingsSection title="Carnets de acceso" subtitle="Emite un carnet por miembro. El código sólo se muestra una vez; imprímelo o entrégalo de inmediato." flush>
            <div className="grid grid-cols-1 items-end gap-3 border-b border-border-light p-5 xl:grid-cols-[minmax(0,1fr)_auto]">
                <label className="min-w-0 font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary">Miembro
                    <select className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-surface-1 px-3 font-sans text-sm text-foreground" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                        <option value="">Selecciona un miembro</option>
                        {members.map((member) => <option key={member.memberId ?? member.id} value={member.memberId ?? member.id}>{member.email}</option>)}
                    </select>
                </label>
                <BaseButton.Root className="h-auto min-h-10 w-full shrink-0 whitespace-normal px-4 py-2 xl:w-auto [&>span]:whitespace-normal" variant="primary" isDisabled={working !== null} loading={working === "badge-issue"} onClick={() => void issueBadge(memberId)} leftIcon={<Plus size={14} />}>Emitir carnet</BaseButton.Root>
            </div>
            <AccessRows entries={badges} empty="No hay carnets emitidos." working={working} disableRevoke={issuingBadge} onRevoke={(id) => void revoke("badge", id)} onReissue={(badge) => void issueBadge(badge.userId, badge)} />
        </SettingsSection>

        {issued && <div ref={issuedBadgeRef} tabIndex={-1} className="scroll-mt-6 outline-none"><IssuedBadgeCard barcode={issued.barcode} email={issued.badge.email} onClose={() => setIssued(null)} /></div>}
        {loading && <p className="font-sans text-sm text-text-tertiary">Cargando accesos…</p>}
    </div>;
}

function AccessRows({ entries, empty, working, disableRevoke = false, onRevoke, onReissue }: { entries: Array<TerminalEntry | BadgeEntry>; empty: string; working: string | null; disableRevoke?: boolean; onRevoke: (id: string) => void; onReissue?: (badge: BadgeEntry) => void }) {
    if (!entries.length) return <p className="p-6 text-sm text-text-tertiary">{empty}</p>;
    return <ul className="divide-y divide-border-light">{entries.map((entry) => <li key={entry.id} className="flex flex-wrap items-center gap-3 p-4">
        <ScanBarcode className="h-4 w-4 shrink-0 text-primary-500" aria-hidden />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{"email" in entry ? entry.email : entry.name}</p><p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">{entry.status}{"lastUsedAt" in entry && entry.lastUsedAt ? ` · Último uso ${new Date(entry.lastUsedAt).toLocaleDateString("es-VE")}` : ""}</p></div>
        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-1 sm:w-auto">
            {"userId" in entry && entry.status !== "revoked" && onReissue && <BaseButton.Root size="sm" variant="ghost" isDisabled={working !== null} loading={working === `badge-reissue-${entry.id}`} onClick={() => onReissue(entry)} leftIcon={<RefreshCw size={13} />}>Reemitir</BaseButton.Root>}
            {entry.status !== "revoked" && <BaseButton.Root size="sm" variant="ghost" isDisabled={disableRevoke || working !== null} onClick={() => onRevoke(entry.id)} leftIcon={<ShieldOff size={13} />}>Revocar</BaseButton.Root>}
        </div>
    </li>)}</ul>;
}
