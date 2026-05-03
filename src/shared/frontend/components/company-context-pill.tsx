"use client";

// ----------------------------------------------------------------------------
// Company context pill — surfaces "which company is this entry going into?"
// in flows where the user is creating data scoped to the active company
// (purchase invoices, manual entries, inventory operations).
//
// Reads from the same CompanyProvider as the rest of the app, so the pill
// always reflects the live selection from the sidebar selector. Hidden when
// no company is loaded — never breaks header layout.
//
// Visual language matches the BCV pill (font-mono uppercase + thin border)
// to read as chrome rather than content.
// ----------------------------------------------------------------------------

import { Building2 } from "lucide-react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";

interface Props {
    className?: string;
}

export function CompanyContextPill({ className = "" }: Props) {
    const { company } = useCompany();
    if (!company) return null;

    return (
        <div
            className={[
                "inline-flex items-center gap-2 h-9 px-3 rounded-lg border",
                "border-border-light bg-surface-2 shadow-sm",
                "max-w-[360px] min-w-0",
                className,
            ].join(" ")}
            title={[company.name, company.rif].filter(Boolean).join(" · ")}
            aria-label={`Empresa activa: ${company.name}${company.rif ? ` (${company.rif})` : ""}`}
        >
            <Building2 size={13} strokeWidth={2} className="text-primary-500 flex-shrink-0" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--text-tertiary)] flex-shrink-0">
                Empresa
            </span>
            <span className="font-mono text-[12px] font-bold text-foreground truncate min-w-0">
                {company.name}
            </span>
            {company.rif && (
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums text-[var(--text-tertiary)] flex-shrink-0 pl-2 border-l border-border-light">
                    {company.rif}
                </span>
            )}
        </div>
    );
}
