"use client";

import Image from "next/image";
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { Building2, ChevronsUpDown, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUrlContext } from "@/src/shared/frontend/hooks/use-url-context";
import { useOrganization } from "../context/organization-context";

/**
 * Keeps the active organization visible even when the user has one workspace.
 *
 * @returns An accessible workspace menu with the organization settings entry.
 * @throws Does not throw expected API failures; renders directory recovery inline.
 */
export function OrganizationSwitcher(): React.JSX.Element {
  const { organizations, organization, loading, error, refresh, selectOrganization } = useOrganization();
  const { buildContextHref } = useUrlContext();
  const router = useRouter();

  if (error) return (
    <div className="rounded-xl border border-sidebar-border p-3 text-sidebar-label">
      <p className="font-sans text-xs">No se pudo cargar la organización.</p>
      <Button size="sm" variant="light" onPress={() => void refresh()} className="mt-1 text-primary-500">Reintentar</Button>
    </div>
  );

  return (
    <Dropdown placement="bottom-start">
      <DropdownTrigger>
        <Button
          aria-label={`Organización: ${organization?.name ?? "Sin selección"}. Abrir organizaciones`}
          isDisabled={loading}
          variant="light"
          className="h-auto min-h-16 w-full justify-start gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-bg-hover/60 p-2.5 text-left data-[hover=true]:bg-sidebar-bg-hover"
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary-500/20 bg-primary-500/10 text-primary-500">
            {organization?.logoUrl
              ? <Image src={organization.logoUrl} alt="" fill unoptimized sizes="36px" className="object-cover" />
              : <Building2 size={19} aria-hidden />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-sidebar-label">Organización</p>
            <p className="mt-0.5 truncate font-sans text-sm font-semibold text-sidebar-fg-hover">
              {loading ? "Cargando organización…" : organization?.name ?? "Sin organización"}
            </p>
          </div>
          <ChevronsUpDown size={14} className="shrink-0 text-sidebar-label" aria-hidden />
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Organizaciones disponibles"
        onAction={(key) => {
          if (key === "settings") router.push(buildContextHref("/settings/organization"));
          else selectOrganization(String(key));
        }}
        className="max-h-80 w-64 overflow-y-auto"
      >
        {[
          ...organizations.map((entry) => (
            <DropdownItem key={entry.id} textValue={entry.name} description={entry.id === organization?.id ? "Organización activa" : "Cambiar a esta organización"} className={entry.id === organization?.id ? "bg-primary-500/10" : ""}>
              {entry.name}
            </DropdownItem>
          )),
          <DropdownItem key="settings" startContent={<Settings size={16} aria-hidden />} className="mt-1 border-t border-border-light" textValue="Gestionar organización">Gestionar organización</DropdownItem>,
        ]}
      </DropdownMenu>
    </Dropdown>
  );
}
