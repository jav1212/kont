"use client";

// Documents module dashboard (tablero).
// Entry point for the Documentos module — accessible on both web and PWA/mobile.
// Shows document indicators and fast access to key document operations.
// Constraint: read-only; all uploads and mutations happen inside /documents.

import Link from "next/link";
import { PageHeader }            from "@/src/shared/frontend/components/page-header";
import { DashboardKpiCard }      from "@/src/shared/frontend/components/dashboard-kpi-card";
import { DashboardQuickActions } from "@/src/shared/frontend/components/dashboard-quick-actions";
import { currentPeriod }         from "@/src/shared/frontend/utils/current-period";
import { useCompany }            from "@/src/modules/companies/frontend/hooks/use-companies";
import { useDocuments }          from "@/src/modules/documents/frontend/hooks/use-documents";

// ── quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
    { href: "/documents/files", label: "Explorar archivos", desc: "Navegar carpetas y documentos"   },
    { href: "/companies",       label: "Empresas",          desc: "Gestionar empresas y carpetas"   },
];

// ── component ─────────────────────────────────────────────────────────────────

export default function DocumentsDashboard() {
    const { companyId }                  = useCompany();
    const { folders, documents, loading } = useDocuments(companyId ?? undefined);

    const periodo      = currentPeriod();
    const totalFolders = folders.length;
    const totalDocs    = documents.length;
    // Documents whose createdAt starts with the current period (YYYY-MM)
    const docsThisPeriod = documents.filter((d) => d.createdAt?.startsWith(periodo)).length;

    return (
        <div className="flex flex-col min-h-full bg-surface-2 font-mono">
            <PageHeader title="Documentos" subtitle={`Tablero — ${periodo}`}>
                <Link
                    href="/documents/files"
                    className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[13px] uppercase tracking-[0.12em] flex items-center gap-1.5 transition-colors"
                >
                    Ver archivos
                </Link>
            </PageHeader>

            <div className="flex flex-col gap-6 px-8 py-6">

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <DashboardKpiCard
                        label="Carpetas"
                        value={totalFolders}
                        color="primary"
                        loading={loading}
                    />
                    <DashboardKpiCard
                        label="Documentos cargados"
                        value={totalDocs}
                        color="default"
                        loading={loading}
                    />
                    <DashboardKpiCard
                        label="Subidos este mes"
                        value={docsThisPeriod}
                        color="success"
                        loading={loading}
                    />
                </div>

                {/* Recent documents */}
                {!loading && documents.length > 0 && (
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                            <p className="text-[13px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                Documentos recientes
                            </p>
                            <Link
                                href="/documents/files"
                                className="text-[13px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-colors"
                            >
                                Ver todos <span aria-hidden="true">→</span>
                            </Link>
                        </div>
                        <ul className="divide-y divide-border-light/50">
                            {documents.slice(0, 8).map((doc) => (
                                <li
                                    key={doc.id}
                                    className="px-5 py-3 flex items-center gap-3 hover:bg-surface-2 transition-colors"
                                >
                                    <svg
                                        width="13" height="13" viewBox="0 0 13 13" fill="none"
                                        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                                        aria-hidden="true"
                                        className="text-foreground/40 flex-shrink-0"
                                    >
                                        <path d="M3 1h5l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" />
                                        <path d="M8 1v3h3" />
                                    </svg>
                                    <span className="font-mono text-[13px] text-foreground truncate flex-1">
                                        {doc.name}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {!loading && documents.length === 0 && (
                    <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-8 text-center">
                        <p className="font-mono text-[13px] text-[var(--text-tertiary)]">
                            No hay documentos.{" "}
                            <Link href="/documents/files" className="text-primary-500 underline">
                                Subir uno
                            </Link>
                        </p>
                    </div>
                )}

                {/* Quick actions */}
                <DashboardQuickActions actions={QUICK_ACTIONS} columns={2} />

            </div>
        </div>
    );
}
