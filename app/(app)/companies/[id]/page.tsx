"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Mail, MapPin, Phone, Tag, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { SECTOR_LABELS } from "@/src/modules/companies/backend/domain/company";

export default function CompanyDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const { companies, loading } = useCompany();
    const company = companies.find((item) => item.id === decodeURIComponent(params.id));

    return (
        <div className="min-h-full bg-background">
            <PageHeader title={company?.name ?? "Empresa"} />
            <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-6 sm:px-8 sm:py-8">
                <BaseButton.Root variant="secondary" size="sm" onClick={() => router.push("/companies")} leftIcon={<ArrowLeft size={14} />}>
                    Empresas
                </BaseButton.Root>

                {loading ? (
                    <div className="rounded-lg border border-border-light bg-surface-1 p-8 text-sm text-[var(--text-secondary)]">Cargando empresa…</div>
                ) : !company ? (
                    <div className="rounded-lg border border-border-light bg-surface-1 p-8 text-sm text-[var(--text-secondary)]">Empresa no encontrada.</div>
                ) : (
                    <>
                        <section className="flex items-center gap-4 border-b border-border-light pb-6">
                            <div className="flex size-12 items-center justify-center overflow-hidden rounded-lg border border-border-light bg-surface-2">
                                {company.logoUrl ? <img src={company.logoUrl} alt="" className="size-full object-cover" /> : <Building2 size={20} className="text-[var(--text-tertiary)]" />}
                            </div>
                            <div>
                                <p className="mb-1 font-sans text-[12px] text-[var(--text-tertiary)]">Empresa</p>
                                <h1 className="font-sans text-2xl font-semibold tracking-tight text-foreground">{company.name}</h1>
                                <p className="mt-1 font-mono text-sm text-[var(--text-secondary)]">{company.id}</p>
                            </div>
                        </section>

                        <section className="space-y-3">
                            <h2 className="font-sans text-[15px] font-medium text-foreground">Información de la empresa</h2>
                            <div className="grid gap-3 sm:grid-cols-2">
                            {([ 
                                [Phone, "Teléfono", company.phone],
                                [Mail, "Correo de contacto", company.contactEmail],
                                [MapPin, "Dirección", company.address],
                                [Tag, "Sector", company.sector ? SECTOR_LABELS[company.sector] : undefined],
                            ] as [LucideIcon, string, string | undefined][]).map(([Icon, label, value]) => (
                                <div key={label as string} className="rounded-lg border border-border-light bg-surface-1 p-4">
                                    <div className="flex items-center gap-2 text-[var(--text-secondary)]"><Icon size={16} /><span className="font-sans text-sm">{label}</span></div>
                                    <p className="mt-3 font-sans text-[15px] text-foreground">{(value as string) || "Sin información"}</p>
                                </div>
                            ))}
                            </div>
                        </section>
                    </>
                )}
            </main>
        </div>
    );
}


