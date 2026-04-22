"use client";

import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { ToolsShell } from "@/src/modules/tools/frontend/components/tools-shell";

export default function DivisasPage() {
    return (
        <div className="flex flex-col min-h-full bg-surface-2 selection:bg-primary-500/30 font-mono">
            <PageHeader title="Divisas BCV" subtitle="Calculadora de tasas oficiales" />
            <ToolsShell variant="authed" />
        </div>
    );
}
