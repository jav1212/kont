"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Search, Settings, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUrlContext } from "@/src/shared/frontend/hooks/use-url-context";
import type { OrganizationWorkspace } from "../../contracts";
import { useOrganization } from "../context/organization-context";
import { useOrganizationModuleAccess } from "../use-organization-module-access";

/**
 * Provides a solid, keyboard-accessible account menu for switching the active
 * organization without inheriting the surrounding sidebar's menu layout.
 *
 * @returns The active organization trigger and its scoped workspace menu.
 * @throws Does not throw expected directory failures; renders recovery inline.
 */
export function OrganizationSwitcher(): React.JSX.Element {
  const { organizations, organization, loading, error, refresh, selectOrganization } = useOrganization();
  const organizationSettingsAccess = useOrganizationModuleAccess("/settings/organization");
  const { buildContextHref } = useUrlContext();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const visibleOrganizations = useMemo(
    () => normalizedQuery
      ? organizations.filter((entry) => entry.name.toLocaleLowerCase("es").includes(normalizedQuery))
      : organizations,
    [normalizedQuery, organizations],
  );
  const personalOrganizations = visibleOrganizations.filter((entry) => entry.role === "owner");
  const memberOrganizations = visibleOrganizations.filter((entry) => entry.role !== "owner");
  const canManageOrganization = organizationSettingsAccess.state === "allowed";
  const canSwitch = organizations.length > 1;

  useEffect(() => {
    if (!open) return;

    const dismiss = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    document.addEventListener("mousedown", dismiss);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", dismiss);
    };
  }, [open]);

  if (error) return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar-bg p-3 text-sidebar-label">
      <p className="font-sans text-xs">No se pudo cargar la organización.</p>
      <button
        type="button"
        onClick={() => void refresh()}
        className="mt-1 text-xs font-semibold text-primary-500 hover:text-primary-600"
      >
        Reintentar
      </button>
    </div>
  );

  const close = (restoreFocus = false): void => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const choose = (id: string): void => {
    selectOrganization(id);
    close();
  };
  const toggle = (): void => {
    if (!canSwitch) return;
    setQuery("");
    setOpen((current) => !current);
  };

  return (
    <div
      ref={containerRef}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) close();
      }}
      className={`relative px-0.5 pb-1 ${open ? "z-[70]" : "z-0"}`}
    >
      <p className="mb-1 ml-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-sidebar-label">
        Trabajando en
      </p>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Organización: ${organization?.name ?? "Sin selección"}. ${canSwitch ? "Abrir organizaciones" : "Organización activa"}`}
        aria-expanded={canSwitch ? open : undefined}
        aria-haspopup={canSwitch ? "dialog" : undefined}
        disabled={loading}
        onClick={toggle}
        className="flex min-h-14 w-full items-center gap-2.5 rounded-xl bg-sidebar-bg-hover/60 px-2.5 py-2 text-left text-sidebar-fg transition-colors hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border disabled:cursor-wait disabled:opacity-70"
      >
        <OrganizationAvatar organization={organization} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-sans text-sm font-semibold text-sidebar-fg-hover">
            {loading ? "Cargando organización…" : organization?.name ?? "Sin organización"}
          </span>
          <span className="mt-0.5 block truncate font-sans text-[11px] font-medium text-sidebar-label">
            {organization?.role === "owner" ? "Mi cuenta" : "Membresía directa"}
          </span>
        </span>
        {canSwitch ? (
          <ChevronDown
            size={16}
            className={`shrink-0 text-sidebar-label transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Cuentas disponibles"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close(true);
            }
          }}
          className="absolute left-0 top-[calc(100%+0.25rem)] z-[70] flex max-h-[min(32rem,calc(100dvh-12rem))] w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-sidebar-border bg-sidebar-bg text-sidebar-fg shadow-xl"
        >
          <div className="flex items-center gap-2 border-b border-sidebar-border p-3">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-bg px-3 text-sidebar-label focus-within:border-sidebar-active-border focus-within:ring-2 focus-within:ring-sidebar-active-border/20">
              <Search size={17} aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar cuenta…"
                aria-label="Buscar cuenta"
                className="min-w-0 flex-1 bg-transparent text-sm text-sidebar-fg-hover outline-none placeholder:text-sidebar-label"
              />
            </label>
            <button
              type="button"
              onClick={() => close(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-bg-hover text-sidebar-label hover:text-sidebar-fg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
              aria-label="Cerrar selector de organización"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <OrganizationGroup
              label="Mi cuenta"
              entries={personalOrganizations}
              selectedId={organization?.id}
              onSelect={choose}
            />
            <OrganizationGroup
              label="Otras cuentas"
              entries={memberOrganizations}
              selectedId={organization?.id}
              onSelect={choose}
              separated={personalOrganizations.length > 0}
            />
            {visibleOrganizations.length === 0 ? (
              <p className="px-3 py-5 text-center text-sm text-sidebar-label">
                No hay cuentas que coincidan.
              </p>
            ) : null}
            {canManageOrganization ? (
              <div className="mt-2 border-t border-sidebar-border pt-2">
                <button
                  type="button"
                  onClick={() => {
                    close();
                    router.push(buildContextHref("/settings/organization"));
                  }}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-semibold text-sidebar-fg hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
                >
                  <Settings size={16} className="text-sidebar-label" aria-hidden />
                  Gestionar organización
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface OrganizationGroupProps {
  readonly entries: readonly OrganizationWorkspace[];
  readonly label: string;
  readonly onSelect: (id: string) => void;
  readonly selectedId: string | undefined;
  readonly separated?: boolean;
}

/**
 * Renders one labelled group in the organization directory.
 *
 * @param props - Entries and selection state for one account group.
 * @returns The group, or nothing when it has no visible entries.
 */
function OrganizationGroup({
  entries,
  label,
  onSelect,
  selectedId,
  separated = false,
}: OrganizationGroupProps): React.JSX.Element | null {
  if (entries.length === 0) return null;

  return (
    <section className={separated ? "mt-2 border-t border-sidebar-border pt-2" : undefined}>
      <h2 className="px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-sidebar-label">
        {label}
      </h2>
      {entries.map((entry) => {
        const selected = entry.id === selectedId;
        return (
          <button
            type="button"
            key={entry.id}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(entry.id)}
            className={`flex min-h-[3.25rem] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border ${selected ? "bg-sidebar-bg-hover" : ""}`}
          >
            <OrganizationAvatar organization={entry} small />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sans text-sm font-semibold text-sidebar-fg-hover">
                {entry.name}
              </span>
              <span className="mt-0.5 block truncate font-sans text-[11px] font-medium text-sidebar-label">
                {entry.role === "owner" ? "Mi cuenta" : "Membresía directa"}
              </span>
            </span>
            {selected ? (
              <Check size={18} className="shrink-0 text-primary-500" aria-label="Organización activa" />
            ) : null}
          </button>
        );
      })}
    </section>
  );
}

interface OrganizationAvatarProps {
  readonly organization: Pick<OrganizationWorkspace, "logoUrl" | "name"> | null;
  readonly small?: boolean;
}

/**
 * Renders an organization logo with a stable initial fallback.
 *
 * @param props - Organization identity and requested avatar size.
 * @returns The organization avatar.
 */
function OrganizationAvatar({
  organization,
  small = false,
}: OrganizationAvatarProps): React.JSX.Element {
  const initial = organization?.name.trim().charAt(0).toLocaleUpperCase("es") ?? "?";
  const dimension = small ? "h-8 w-8" : "h-9 w-9";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary-500/20 bg-primary-500/10 font-sans text-xs font-bold text-primary-500 ${dimension}`}
      aria-hidden
    >
      {organization?.logoUrl ? (
        <Image
          src={organization.logoUrl}
          alt=""
          fill
          unoptimized
          sizes={small ? "32px" : "36px"}
          className="object-cover"
        />
      ) : organization ? initial : <Building2 size={small ? 16 : 19} />}
    </span>
  );
}
