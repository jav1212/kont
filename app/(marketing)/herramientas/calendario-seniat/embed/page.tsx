import type { Metadata } from "next";
import { Suspense } from "react";
import { SeniatCalendarShell } from "@/src/modules/tools/seniat-calendar/components/seniat-calendar-shell";

export const metadata: Metadata = {
    title: "Calendario Tributario SENIAT — Kontave",
    description: "Widget embebible del Calendario Tributario SENIAT 2026.",
    robots: { index: false, follow: false },
};

export default function EmbedPage() {
    return (
        <Suspense>
            <SeniatCalendarShell variant="embed" />
        </Suspense>
    );
}
