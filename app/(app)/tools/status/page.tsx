"use client";

import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { StatusShell } from "@/src/modules/tools/frontend/status/components/status-shell";

export default function StatusPage() {
    return (
        <div className="flex flex-col min-h-full bg-surface-2 selection:bg-primary-500/30 font-mono">
            <PageHeader title="Estatus de Portales" subtitle="Disponibilidad de servicios gubernamentales de Venezuela" />
            <StatusShell variant="authed" />
        </div>
    );
}
