"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { StatusShell, type StatusFilter } from "@/src/modules/tools/frontend/status/components/status-shell";

const VALID_FILTERS: readonly StatusFilter[] = ["operational", "degraded", "down"];

export default function StatusPage() {
    return (
        <div className="flex flex-col min-h-full bg-surface-2 selection:bg-primary-500/30 font-mono">
            <PageHeader title="Estatus de Portales" subtitle="Disponibilidad de servicios gubernamentales de Venezuela" />
            <Suspense fallback={<StatusShell variant="authed" />}>
                <StatusShellWithFilter />
            </Suspense>
        </div>
    );
}

function StatusShellWithFilter() {
    const params = useSearchParams();
    const raw = params?.get("filter");
    const filter = VALID_FILTERS.includes(raw as StatusFilter) ? (raw as StatusFilter) : null;
    return <StatusShell variant="authed" filter={filter} />;
}
