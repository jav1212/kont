"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Plus, Printer, RefreshCw, ScanBarcode, ShieldOff } from "lucide-react";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { notify } from "@/src/shared/frontend/notify";
import { IssuedBadgeCard } from "@/src/modules/auth/frontend/components/issued-badge-card";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";

interface BadgeEntry { id: string; userId: string; email: string | null; status: string; reprintable: boolean; createdAt: string; revokedAt: string | null }
interface Member { id: string; memberId: string | null; email: string; pending: boolean }
interface IssuedBadge { badge: BadgeEntry; barcode: string }
interface BatchResult { userId: string; issued: boolean }

/**
 * Manages tenant-scoped printable access credentials.
 *
 * @returns The access administration screen.
 * @remarks Barcode values remain only in memory for an immediate preview or PDF.
 */
export default function AccessSettingsPage() {
    const { activeTenantId, activeTenantRole } = useActiveTenantContext();
    const { state: accessState, can } = useOrganizationModuleAccess("/settings/access");
    const { user } = useAuth();
    const [badges, setBadges] = useState<BadgeEntry[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
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
            const [badgesResponse, membersResponse] = await Promise.all([
                apiFetch("/api/access/badges", { signal: controller.signal }),
                apiFetch("/api/memberships/members", { signal: controller.signal }),
            ]);
            const [badgeBody, memberBody] = await Promise.all([badgesResponse.json(), membersResponse.json()]) as [{ data?: { badges?: BadgeEntry[] } }, { data?: Member[] }];
            if (!isCurrent()) return;
            if (!badgesResponse.ok) { notify.error("No se pudo cargar la configuración de acceso."); return; }
            const activeBadges = (badgeBody.data?.badges ?? []).filter((item) => item.status === "active");
            setBadges(activeBadges);
            setSelectedBadgeIds((current) => new Set([...current].filter((id) => activeBadges.some((badge) => badge.id === id && badge.reprintable))));
            const listed = membersResponse.ok ? (memberBody.data ?? []).filter((item) => !item.pending) : [];
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

    async function revoke(id: string) {
        if (mutationInFlight.current || !window.confirm("¿Revocar este acceso? Las sesiones vinculadas dejarán de funcionar.")) return;
        mutationInFlight.current = true; setWorking(id);
        try {
            const response = await apiFetch(`/api/access/badges/${id}/revoke`, { method: "POST" });
            const body = await response.json() as { error?: string };
            if (!response.ok) { notify.error(body.error ?? "No se pudo revocar."); return; }
            await reload();
        } finally { mutationInFlight.current = false; setWorking(null); }
    }

    if (accessState !== "allowed" || !permitted) return null;
    return <div className="space-y-6">
        <SettingsSection title="Carnets de acceso" subtitle="Selecciona miembros para emitir o reemitir carnets en un solo paso." flush>
            <div className="border-b border-border-light p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary">Miembros confirmados</p><Check label="Seleccionar todos los miembros confirmados" checked={allMembersSelected} disabled={!memberIds.length || working !== null} onChange={() => setSelectedMemberIds(allMembersSelected ? new Set() : new Set(memberIds))}>Seleccionar todos</Check></div>{members.length ? <ul className="max-h-56 divide-y divide-border-light overflow-y-auto rounded-lg border border-border-light">{members.map((member) => { const id = member.memberId ?? member.id; return <li key={id}><Check label={`Seleccionar a ${member.email}`} checked={selectedMemberIds.has(id)} disabled={working !== null} onChange={() => setSelectedMemberIds((current) => toggleSet(current, id))}>{member.email}</Check></li>; })}</ul> : <p className="text-sm text-text-tertiary">No hay miembros confirmados para emitir carnets.</p>}<div className="mt-3 flex justify-end"><BaseButton.Root variant="primary" isDisabled={!selectedMemberIds.size || working !== null} loading={working === "badges"} onClick={() => void issueBadges()} leftIcon={<Plus size={14} />}>Emitir o reemitir ({selectedMemberIds.size})</BaseButton.Root></div></div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light p-5"><Check label="Seleccionar todos los carnets activos" checked={allBadgesSelected} disabled={!badgeIds.length || working !== null} onChange={() => setSelectedBadgeIds(allBadgesSelected ? new Set() : new Set(badgeIds))}>Seleccionar todos los activos</Check><BaseButton.Root variant="secondary" isDisabled={!selectedBadgeIds.size || working !== null} loading={working === "badge-export"} onClick={() => void exportSelectedBadges()} leftIcon={<Download size={14} />}>Exportar carnets PDF ({selectedBadgeIds.size})</BaseButton.Root></div>
            <AccessRows entries={badges} empty="No hay carnets activos." working={working} disableRevoke={working === "badges"} selectedIds={selectedBadgeIds} onToggleSelected={(id) => setSelectedBadgeIds((current) => toggleSet(current, id))} onRevoke={(id) => void revoke(id)} onReissue={(badge) => void issueBadge(badge.userId, badge)} onReprint={(badge) => void reprintBadge(badge)} />
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
function toggleSet(current: Set<string>, id: string): Set<string> { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }

/**
 * Renders an accessible checkbox label.
 *
 * @param props - Checkbox configuration and label content.
 * @returns The checkbox control.
 */
function Check({ label, checked, disabled, onChange, children }: { label: string; checked: boolean; disabled: boolean; onChange: () => void; children: ReactNode }) { return <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-foreground"><input aria-label={label} type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />{children}</label>; }

/**
 * Renders active badges and their safe actions.
 *
 * @param props - Entries and action callbacks.
 * @returns The list or its empty state.
 */
function AccessRows({ entries, empty, working, disableRevoke = false, selectedIds, onToggleSelected, onRevoke, onReissue, onReprint }: { entries: BadgeEntry[]; empty: string; working: string | null; disableRevoke?: boolean; selectedIds?: ReadonlySet<string>; onToggleSelected?: (id: string) => void; onRevoke: (id: string) => void; onReissue?: (badge: BadgeEntry) => void; onReprint?: (badge: BadgeEntry) => void }) {
    if (!entries.length) return <p className="p-6 text-sm text-text-tertiary">{empty}</p>;
    return <ul className="divide-y divide-border-light">{entries.map((entry) => <li key={entry.id} className="flex flex-wrap items-center gap-3 p-4">{onToggleSelected && <input aria-label={`Seleccionar carnet de ${entry.email ?? "usuario"}`} type="checkbox" checked={selectedIds?.has(entry.id) ?? false} onChange={() => onToggleSelected(entry.id)} disabled={working !== null || !entry.reprintable} />}<ScanBarcode className="h-4 w-4 shrink-0 text-primary-500" aria-hidden /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{entry.email}</p><p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">{entry.status === "active" ? "Activo" : entry.status}</p>{!entry.reprintable && <p className="mt-1 text-xs text-text-tertiary">Reemite este carnet una vez para habilitar la reimpresión.</p>}</div><div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-1 sm:w-auto">{onReprint && <BaseButton.Root size="sm" variant="ghost" isDisabled={working !== null || !entry.reprintable} loading={working === `badge-print-${entry.id}`} onClick={() => onReprint(entry)} leftIcon={<Printer size={13} />}>Reimprimir</BaseButton.Root>}{onReissue && <BaseButton.Root size="sm" variant="ghost" isDisabled={working !== null} loading={working === `badge-reissue-${entry.id}`} onClick={() => onReissue(entry)} leftIcon={<RefreshCw size={13} />}>Reemitir</BaseButton.Root>}<BaseButton.Root size="sm" variant="ghost" isDisabled={disableRevoke || working !== null} onClick={() => onRevoke(entry.id)} leftIcon={<ShieldOff size={13} />}>Revocar</BaseButton.Root></div></li>)}</ul>;
}
