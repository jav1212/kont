"use client";

import Link from "next/link";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { PageHeader } from "@/src/shared/frontend/components/page-header";

/** Presents the Web IVA workspace and its permission-scoped workflows.
 * @returns IVA navigation for configuration, ledgers, import evidence and internal declarations.
 */
export default function IvaWorkspacePage(): React.JSX.Element {
  const { can } = useOrganizationModuleAccess("/fiscal");
  const cards = [
    ...(can("companies.read") ? [{ href: "/settings/iva", title: "Reglas y perfiles", description: "Administra las reglas tributarias versionadas y perfiles fiscales con evidencia." }] : []),
    ...(can("purchases.read") ? [{ href: "/purchases/iva-ledger", title: "Libro de compras", description: "Consulta los hechos de IVA de compras disponibles para la empresa." }] : []),
    ...(can("sales.read") ? [{ href: "/sales/iva-ledger", title: "Libro de ventas", description: "Consulta los hechos de IVA de ventas disponibles para la empresa." }] : []),
    ...(can("purchases.read") && can("purchases.confirm") ? [{ href: "/purchases/iva-imports", title: "Importaciones", description: "Registra importes y referencias de evidencia para revisión fiscal." }] : []),
    ...(can("purchases.read") && can("sales.read") && can("purchases.confirm") && can("sales.update") ? [{ href: "/fiscal/iva-declarations", title: "Declaraciones internas", description: "Prepara borradores internos y consulta su historial versionado." }] : []),
  ];

  return <main className="min-h-full bg-surface-2 font-mono">
    <PageHeader title="IVA" subtitle="Configuración tributaria, libros fiscales y preparación interna" />
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-2 md:px-8 lg:grid-cols-3">
      {cards.map((card) => <Link key={card.href} href={card.href} className="rounded-xl border border-border-light bg-surface-1 p-5 transition-colors hover:border-primary-500/50 hover:bg-surface-2">
        <h2 className="text-base font-semibold text-foreground">{card.title}</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{card.description}</p>
        <span className="mt-4 inline-block text-sm font-semibold text-primary-500">Abrir →</span>
      </Link>)}
      {cards.length === 0 && <p className="rounded-xl border border-border-light bg-surface-1 p-5 text-sm">Tu organización no tiene permisos para consultar las funciones fiscales.</p>}
    </div>
    <p className="mx-auto max-w-6xl px-4 pb-6 text-xs text-[var(--text-tertiary)] md:px-8">Los borradores y resúmenes internos requieren revisión contable. La clasificación o el perfil por sí solos no determinan la deducibilidad ni una exoneración.</p>
  </main>;
}
