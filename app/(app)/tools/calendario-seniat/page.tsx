"use client";

import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { SeniatCalendarShell } from "@/src/modules/tools/seniat-calendar/components/seniat-calendar-shell";

export default function CalendarioSeniatPage() {
    return (
        <div className="flex flex-col min-h-full bg-surface-2 selection:bg-primary-500/30 font-mono">
            <PageHeader
                title="Calendario Tributario SENIAT"
                subtitle="Fechas oficiales de IVA, ISLR y retenciones según último dígito del RIF"
            />
            <SeniatCalendarShell variant="authed" />
        </div>
    );
}
