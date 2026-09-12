"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Settings } from "lucide-react";
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
        className={[
          "w-full flex items-center gap-2.5 p-2 rounded-lg border transition-colors duration-150 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border disabled:cursor-wait disabled:opacity-70",
          open
            ? "bg-sidebar-bg-hover border-border-medium"
            : "bg-sidebar-bg-hover/60 border-sidebar-border hover:bg-sidebar-bg-hover hover:border-border-medium",
        ].join(" ")}
      >
        <OrganizationAvatar organization={organization} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-sans text-[15px] font-bold text-sidebar-fg-hover">
            {loading ? "Cargando organización…" : organization?.name ?? "Sin organización"}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10px] tracking-[0.02em] text-sidebar-label">
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
          className="absolute left-0 top-[calc(100%+0.25rem)] z-[70] flex max-h-[min(32rem,calc(100dvh-12rem))] w-[min(388px,calc(100vw-16px))] flex-col overflow-hidden rounded-xl border border-sidebar-border bg-sidebar-bg text-sidebar-fg shadow-lg"
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
            <input
              data-slot="organization-search"
              type="search"
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cuenta…"
              aria-label="Buscar cuenta"
              className="h-[var(--control-height-md)] min-h-[var(--control-height-md)] min-w-0 flex-1 rounded-[var(--control-radius)] border border-[var(--control-border)] bg-[var(--surface-1)] px-3 font-[family-name:var(--font-darker-grotesque)] text-[14px] leading-5 text-[var(--text-primary)] shadow-[0_1px_2px_rgb(0_0_0_/_0.02)] transition-[border-color,box-shadow,background-color] placeholder:text-[var(--control-placeholder)] hover:border-[var(--control-border-hover)] focus:border-[var(--control-border-focus)] focus:shadow-[var(--control-focus-shadow)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => close(true)}
              className="shrink-0 rounded-md border border-sidebar-border bg-sidebar-bg-hover/50 px-1.5 py-0.5 font-sans text-[11px] text-sidebar-label hover:text-sidebar-fg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
              aria-label="Cerrar selector de organización"
            >
              Esc
            </button>
          </div>
          <div className="min-h-0 max-h-80 flex-1 overflow-y-auto p-1.5">
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
          </div>
          {canManageOrganization ? (
            <div className="mx-2 shrink-0 border-t border-sidebar-border px-0 py-2">
              <button
                type="button"
                onClick={() => {
                  close();
                  router.push(buildContextHref("/settings/organization"));
                }}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-left text-sidebar-fg hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
              >
                <span className="shrink-0 inline-flex items-center justify-center text-sidebar-label">
                  <Settings size={16} strokeWidth={1.8} aria-hidden />
                </span>
                <span className="min-w-0 font-mono text-[15px] font-bold tracking-[0.02em]">Gestionar organización</span>
              </button>
            </div>
          ) : null}
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
  readonly organization: Pick<OrganizationWorkspace, "avatarUrl" | "logoUrl" | "name"> | null;
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
  const imageUrl = organization?.avatarUrl ?? organization?.logoUrl ?? null;
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary-500/20 bg-primary-500/10 font-sans text-xs font-bold text-primary-500 ${dimension}`}
      aria-hidden
    >
      {imageUrl && failedImageUrl !== imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          unoptimized
          sizes={small ? "32px" : "36px"}
          className="object-cover"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : organization ? initial : <Building2 size={small ? 16 : 19} />}
    </span>
  );
}
