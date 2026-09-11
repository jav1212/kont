"use client";

import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { useOrganizationModuleAccess } from "../use-organization-module-access";

/**
 * Prevents protected route content from mounting before organization access is known.
 * This presentation boundary does not replace server-side API authorization.
 *
 * @param props - Current route and content to mount only after authorization.
 * @returns Loading feedback, an accessible denial state, or authorized route content.
 * @throws Error when mounted outside OrganizationProvider.
 */
export function OrganizationRouteGuard({ pathname, children }: { pathname: string; children: ReactNode }): React.JSX.Element {
  const access = useOrganizationModuleAccess(pathname);
  if (access.state === "allowed") return <>{children}</>;
  if (access.state === "loading") {
    return <div className="flex flex-1 items-center justify-center p-6" aria-live="polite"><p className="font-sans text-sm text-[var(--text-secondary)]">Verificando acceso a la organización…</p></div>;
  }
  return <section className="m-auto w-full max-w-lg rounded-xl border border-border-light bg-surface-1 p-7 text-center shadow-[var(--shadow-sm)]" aria-labelledby="organization-access-denied">
    <LockKeyhole className="mx-auto size-6 text-[var(--text-secondary)]" aria-hidden="true" />
    <h1 id="organization-access-denied" className="mt-3 font-sans text-lg font-semibold text-foreground">No tienes acceso a este módulo</h1>
    <p className="mt-2 font-sans text-sm text-[var(--text-secondary)]">{access.organizationName ? `Tu rol en ${access.organizationName} no autoriza esta sección.` : "Selecciona una organización con acceso para continuar."}</p>
    <Link href="/tools" className="mt-5 inline-flex rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">Ir a Herramientas</Link>
  </section>;
}
