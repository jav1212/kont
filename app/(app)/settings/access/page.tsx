"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Plus, Printer, RefreshCw, ScanBarcode, ShieldOff, Terminal } from "lucide-react";
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
interface BadgeEntry { id: string; userId: string; email: string | null; status: string; reprintable: boolean; createdAt: string; revokedAt: string | null }
interface Member { id: string; memberId: string | null; email: string; pending: boolean }
interface IssuedBadge { badge: BadgeEntry; barcode: string }
interface BatchResult { userId: string; issued: boolean; badge?: BadgeEntry; code?: string }

/**
 * Manages tenant-scoped browser terminals and printable access credentials.
 *
 * @returns The access administration screen.
 * @remarks Barcode values remain only in memory for an immediate preview or PDF.
 */
export default function AccessSettingsPage() {
    const { activeTenantId, activeTenantRole } = useActiveTenantContext();
    const { state: accessState, can } = useOrganizationModuleAccess("/settings/access");
    const { user } = useAuth();
    const [terminals, setTerminals] = useState<TerminalEntry[]>([]);
    const [badges, setBadges] = useState<BadgeEntry[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [terminalName, setTerminalName] = useState("");
    const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(() => new Set());
    const [selectedBadgeIds, setSelectedBadgeIds] = useState<Set<string>>(() => new Set());
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
    const memberIds = useMemo(() => members.map((member) => member.memberId ?? member.id), [members]);
    const badgeIds = useMemo(() => badges.filter((badge) => badge.reprintable).map((badge) => badge.id), [badges]);
    const allMembersSelected = memberIds.length > 0 && memberIds.every((id) => selectedMemberIds.has(id));
    const allBadgesSelected = badgeIds.length > 0 && badgeIds.every((id) => selectedBadgeIds.has(id));

    useEffect(() => {
        mounted.current = true; activeScope.current = scope;
        return () => { mounted.current = false; activeScope.current = ""; };
    }, [scope]);

    const reload = useCallback(async () => {
        if (!mounted.current || activeScope.current !== scope || !activeTenantId || !permitted) return;
        reloadAbortController.current?.abort();
        const controller = new AbortController();
        reloadAbortController.current = controller;
        const requestId = ++reloadRequestId.current;
        const isCurrent = () => requestId === reloadRequestId.current && !controller.signal.aborted && mounted.current && activeScope.current === scope;
        setLoading(true);
        try {
            const [terminalsResponse, badgesResponse, membersResponse] = await Promise.all([
                apiFetch("/api/access/terminals", { signal: controller.signal }),
                apiFetch("/api/access/badges", { signal: controller.signal }),
                apiFetch("/api/memberships/members", { signal: controller.signal }),
            ]);
            const [terminalBody, badgeBody, memberBody] = await Promise.all([terminalsResponse.json(), badgesResponse.json(), membersResponse.json()]) as Array<{ data?: { terminals?: TerminalEntry[]; badges?: BadgeEntry[] } | Member[] }>;
            if (!isCurrent()) return;
            if (!terminalsResponse.ok || !badgesResponse.ok) { notify.error("No se pudo cargar la configuración de acceso."); return; }
            setTerminals(((terminalBody.data as { terminals?: TerminalEntry[] } | undefined)?.terminals ?? []).filter((item) => item.status !== "revoked"));
            const activeBadges = ((badgeBody.data as { badges?: BadgeEntry[] } | undefined)?.badges ?? []).filter((item) => item.status === "active");
            setBadges(activeBadges);
            setSelectedBadgeIds((current) => new Set([...current].filter((id) => activeBadges.some((badge) => badge.id === id && badge.reprintable))));
            const listed = membersResponse.ok ? ((memberBody.data as Member[] | undefined) ?? []).filter((item) => !item.pending) : [];
            if (activeTenantRole === "owner" && userId && !listed.some((item) => (item.memberId ?? item.id) === userId)) listed.unshift({ id: userId, memberId: userId, email: userEmail ?? userId, pending: false });
            setMembers(listed);
        } catch { if (isCurrent()) notify.error("No se pudo conectar con el servidor."); }
        finally { if (isCurrent()) setLoading(false); }
    }, [activeTenantId, activeTenantRole, permitted, scope, userEmail, userId]);

    useEffect(() => {
        if (accessState === "allowed") void reload();
        return () => { reloadRequestId.current += 1; reloadAbortController.current?.abort(); reloadAbortController.current = null; };
    }, [reload, accessState]);
    useEffect(() => { if (!issued) return; issuedBadgeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); issuedBadgeRef.current?.focus({ preventScroll: true }); }, [issued]);

    async function installTerminal() {
        if (mutationInFlight.current) return;
        const name = terminalName.trim();
        if (!name) { notify.error("Asigna un nombre a esta terminal."); return; }
        mutationInFlight.current = true; setWorking("terminal");
        try {
            const response = await apiFetch("/api/access/terminals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, install: true }) });
            const body = await response.json() as { data?: { terminal?: TerminalEntry }; error?: string };
            if (!response.ok) { notify.error(body.error ?? "No se pudo habilitar la terminal."); return; }
            setTerminalName("");
            try {
                const verificationResponse = await fetch("/api/auth/barcode/session", { cache: "no-store" });
                const verification = await verificationResponse.json() as { data?: { terminal?: { ready?: boolean; id?: string; reason?: string } } };
                if (!verificationResponse.ok || verification.data?.terminal?.reason === "access_unavailable") notify.error("La terminal se registró, pero no pudimos verificar este navegador. Intenta nuevamente.");
                else if (body.data?.terminal?.id && verification.data?.terminal?.ready && verification.data.terminal.id === body.data.terminal.id) notify.success("Terminal habilitada en este navegador.");
                else notify.error("La terminal se registró, pero este navegador no conservó la habilitación. Comprueba que permita cookies y vuelve a habilitarlo.");
            } catch { notify.error("La terminal se registró, pero no pudimos verificar este navegador. Intenta nuevamente."); }
            await reload();
        } catch { notify.error("No se pudo conectar con el servidor."); }
        finally { mutationInFlight.current = false; setWorking(null); }
    }

    async function issueBadge(userIdToIssue: string, reissueBadge?: BadgeEntry) {
        if (mutationInFlight.current || !userIdToIssue) return;
        const existing = badges.find((badge) => badge.userId === userIdToIssue);
        const holder = reissueBadge?.email ?? members.find((member) => (member.memberId ?? member.id) === userIdToIssue)?.email ?? "este miembro";
        if ((reissueBadge || existing) && !window.confirm(`¿Reemitir el carnet de ${holder}? El carnet anterior y sus sesiones dejarán de funcionar.`)) return;
        mutationInFlight.current = true; setIssued(null); setWorking(reissueBadge ? `badge-reissue-${reissueBadge.id}` : "badge-issue");
        try {
            const response = await apiFetch("/api/access/badges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: userIdToIssue }) });
            const body = await response.json() as { data?: IssuedBadge; error?: string };
            if (!response.ok || !body.data) { notify.error(body.error ?? "No se pudo emitir el carnet."); return; }
            setIssued(body.data); await reload();
        } catch { notify.error("No se pudo conectar con el servidor. El carnet anterior podría haber sido invalidado; verifica el listado antes de intentar nuevamente."); }
        finally { mutationInFlight.current = false; setWorking(null); }
    }

    async function issueBadges() {
        if (mutationInFlight.current || !selectedMemberIds.size) return;
        const userIds = [...selectedMemberIds];
        const replacing = badges.filter((badge) => userIds.includes(badge.userId)).length;
        if (replacing && !window.confirm(`Se reemitirán ${replacing} carnet${replacing === 1 ? "" : "s"} activo${replacing === 1 ? "" : "s"}. Los códigos y sesiones anteriores dejarán de funcionar. ¿Continuar?`)) return;
        mutationInFlight.current = true; setWorking("badges");
        try {
            let completed = 0; let failures = 0; let pending: string[] = [];
            for (let start = 0; start < userIds.length; start += 50) {
                const response = await apiFetch("/api/access/badges/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: userIds.slice(start, start + 50), replaceExisting: replacing > 0 }) });
                const body = await response.json() as { data?: { results: BatchResult[] }; error?: string };
                if (!response.ok || !body.data) { pending = userIds.slice(start); notify.error(body.error ?? "La emisión se detuvo antes de completar todos los carnets. Puedes reintentar los miembros pendientes."); break; }
                completed += body.data.results.filter((result) => result.issued).length;
                failures += body.data.results.filter((result) => !result.issued).length;
            }
            setSelectedMemberIds(new Set(pending));
            if (completed) notify.success(`${completed} carnet${completed === 1 ? "" : "s"} emitido${completed === 1 ? "" : "s"}.`);
            if (failures) notify.error(`No se emitieron ${failures} carnets; revisa que los miembros sigan siendo elegibles.`);
            await reload();
        } catch { notify.error("No se pudo conectar con el servidor."); }
        finally { mutationInFlight.current = false; setWorking(null); }
    }

    async function reprintBadge(badge: BadgeEntry) {
        if (mutationInFlight.current || !badge.reprintable) return;
        mutationInFlight.current = true; setWorking(`badge-print-${badge.id}`);
        try {
            const response = await apiFetch(`/api/access/badges/${badge.id}/print`, { method: "POST" });
            const body = await response.json() as { data?: IssuedBadge; error?: string };
            if (!response.ok || !body.data) { notify.error(body.error ?? "No se pudo reimprimir el carnet."); return; }
            setIssued(body.data);
        } catch { notify.error("No se pudo conectar con el servidor."); }
        finally { mutationInFlight.current = false; setWorking(null); }
    }

    async function exportSelectedBadges() {
        if (mutationInFlight.current || !selectedBadgeIds.size) return;
        mutationInFlight.current = true; setWorking("badge-export");
        try {
            const response = await apiFetch("/api/access/badges/print", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ badgeIds: [...selectedBadgeIds] }) });
            const body = await response.json() as { data?: { badges?: IssuedBadge[] }; error?: string };
            const printable = body.data?.badges;
            if (!response.ok || !printable?.length) { notify.error(body.error ?? "No se pudieron obtener los carnets seleccionados."); return; }
            const { createAccessBadgesPdf } = await import("@/src/modules/auth/frontend/access-badge-pdf");
            createAccessBadgesPdf(printable.map(({ badge, barcode }) => ({ email: badge.email, barcode }))).save("carnets-acceso.pdf");
            notify.success("Carnets exportados a PDF.");
        } catch { notify.error("No se pudo generar el PDF de los carnets."); }
        finally { mutationInFlight.current = false; setWorking(null); }
    }

    async function revoke(kind: "terminal" | "badge", id: string) {
        if (mutationInFlight.current || !window.confirm("¿Revocar este acceso? Las sesiones vinculadas dejarán de funcionar.")) return;
        mutationInFlight.current = true; setWorking(id);
        try {
            const response = await apiFetch(`/api/access/${kind}s/${id}/revoke`, { method: "POST" });
            const body = await response.json() as { error?: string };
            if (!response.ok) { notify.error(body.error ?? "No se pudo revocar."); return; }
            if (kind === "terminal") setTerminals((current) => current.filter((item) => item.id !== id));
            await reload();
        } finally { mutationInFlight.current = false; setWorking(null); }
    }

    if (accessState !== "allowed" || !permitted) return null;
    return <div className="space-y-6">
        <SettingsSection title="Terminales de acceso" subtitle="Habilita este navegador para que los carnets puedan iniciar sesión." flush>
            <div className="grid grid-cols-1 items-end gap-3 border-b border-border-light p-5 xl:grid-cols-[minmax(0,1fr)_auto]"><BaseInput.Field className="min-w-0" label="Nombre de esta terminal" value={terminalName} onValueChange={setTerminalName} placeholder="Caja principal" /><BaseButton.Root variant="primary" isDisabled={working !== null} loading={working === "terminal"} onClick={() => void installTerminal()} leftIcon={<Terminal size={14} />}>Habilitar este navegador</BaseButton.Root></div>
            <AccessRows entries={terminals} empty="No hay terminales habilitadas." working={working} onRevoke={(id) => void revoke("terminal", id)} />
        </SettingsSection>
        <SettingsSection title="Carnets de acceso" subtitle="Selecciona miembros para emitir o reemitir carnets en un solo paso." flush>
            <div className="border-b border-border-light p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary">Miembros confirmados</p><Check label="Seleccionar todos los miembros confirmados" checked={allMembersSelected} disabled={!memberIds.length || working !== null} onChange={() => setSelectedMemberIds(allMembersSelected ? new Set() : new Set(memberIds))}>Seleccionar todos</Check></div>{members.length ? <ul className="max-h-56 divide-y divide-border-light overflow-y-auto rounded-lg border border-border-light">{members.map((member) => { const id = member.memberId ?? member.id; return <li key={id}><Check label={`Seleccionar a ${member.email}`} checked={selectedMemberIds.has(id)} disabled={working !== null} onChange={() => setSelectedMemberIds((current) => toggleSet(current, id))}>{member.email}</Check></li>; })}</ul> : <p className="text-sm text-text-tertiary">No hay miembros confirmados para emitir carnets.</p>}<div className="mt-3 flex justify-end"><BaseButton.Root variant="primary" isDisabled={!selectedMemberIds.size || working !== null} loading={working === "badges"} onClick={() => void issueBadges()} leftIcon={<Plus size={14} />}>Emitir o reemitir ({selectedMemberIds.size})</BaseButton.Root></div></div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light p-5"><Check label="Seleccionar todos los carnets activos" checked={allBadgesSelected} disabled={!badgeIds.length || working !== null} onChange={() => setSelectedBadgeIds(allBadgesSelected ? new Set() : new Set(badgeIds))}>Seleccionar todos los activos</Check><BaseButton.Root variant="secondary" isDisabled={!selectedBadgeIds.size || working !== null} loading={working === "badge-export"} onClick={() => void exportSelectedBadges()} leftIcon={<Download size={14} />}>Exportar carnets PDF ({selectedBadgeIds.size})</BaseButton.Root></div>
            <AccessRows entries={badges} empty="No hay carnets activos." working={working} disableRevoke={working === "badges"} selectedIds={selectedBadgeIds} onToggleSelected={(id) => setSelectedBadgeIds((current) => toggleSet(current, id))} onRevoke={(id) => void revoke("badge", id)} onReissue={(badge) => void issueBadge(badge.userId, badge)} onReprint={(badge) => void reprintBadge(badge)} />
        </SettingsSection>
        {issued && <div ref={issuedBadgeRef} tabIndex={-1} className="scroll-mt-6 outline-none"><IssuedBadgeCard barcode={issued.barcode} email={issued.badge.email} onClose={() => setIssued(null)} /></div>}
        {loading && <p className="font-sans text-sm text-text-tertiary">Cargando accesos…</p>}
    </div>;
}

/**
 * Toggles one identifier without mutating the existing selection.
 *
 * @param current - Existing selection.
 * @param id - Identifier to toggle.
 * @returns The updated immutable selection.
 */
function toggleSet(current: Set<string>, id: string): Set<string> {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}

/**
 * Renders an accessible checkbox label.
 *
 * @param props - Checkbox configuration and label content.
 * @returns The checkbox control.
 */
function Check({ label, checked, disabled, onChange, children }: { label: string; checked: boolean; disabled: boolean; onChange: () => void; children: ReactNode }) { return <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-foreground"><input aria-label={label} type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />{children}</label>; }

/**
 * Renders visible terminals or active badges and their safe actions.
 *
 * @param props - Entries and action callbacks.
 * @returns The list or its empty state.
 */
function AccessRows({ entries, empty, working, disableRevoke = false, selectedIds, onToggleSelected, onRevoke, onReissue, onReprint }: { entries: Array<TerminalEntry | BadgeEntry>; empty: string; working: string | null; disableRevoke?: boolean; selectedIds?: ReadonlySet<string>; onToggleSelected?: (id: string) => void; onRevoke: (id: string) => void; onReissue?: (badge: BadgeEntry) => void; onReprint?: (badge: BadgeEntry) => void }) {
    if (!entries.length) return <p className="p-6 text-sm text-text-tertiary">{empty}</p>;
    return <ul className="divide-y divide-border-light">{entries.map((entry) => <li key={entry.id} className="flex flex-wrap items-center gap-3 p-4">{onToggleSelected && "userId" in entry && <input aria-label={`Seleccionar carnet de ${entry.email ?? "usuario"}`} type="checkbox" checked={selectedIds?.has(entry.id) ?? false} onChange={() => onToggleSelected(entry.id)} disabled={working !== null || !entry.reprintable} />}<ScanBarcode className="h-4 w-4 shrink-0 text-primary-500" aria-hidden /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{"email" in entry ? entry.email : entry.name}</p><p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">{entry.status === "active" ? "Activo" : entry.status}{"lastUsedAt" in entry && entry.lastUsedAt ? ` · Último uso ${new Date(entry.lastUsedAt).toLocaleDateString("es-VE")}` : ""}</p>{"reprintable" in entry && !entry.reprintable && <p className="mt-1 text-xs text-text-tertiary">Reemite este carnet una vez para habilitar la reimpresión.</p>}</div><div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-1 sm:w-auto">{"reprintable" in entry && onReprint && <BaseButton.Root size="sm" variant="ghost" isDisabled={working !== null || !entry.reprintable} loading={working === `badge-print-${entry.id}`} onClick={() => onReprint(entry)} leftIcon={<Printer size={13} />}>Reimprimir</BaseButton.Root>}{"userId" in entry && onReissue && <BaseButton.Root size="sm" variant="ghost" isDisabled={working !== null} loading={working === `badge-reissue-${entry.id}`} onClick={() => onReissue(entry)} leftIcon={<RefreshCw size={13} />}>Reemitir</BaseButton.Root>}<BaseButton.Root size="sm" variant="ghost" isDisabled={disableRevoke || working !== null} onClick={() => onRevoke(entry.id)} leftIcon={<ShieldOff size={13} />}>Revocar</BaseButton.Root></div></li>)}</ul>;
}
