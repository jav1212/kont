import type { Metadata } from "next";
import { Suspense } from "react";
import { SeniatCalendarShell } from "@/src/modules/tools/seniat-calendar/components/seniat-calendar-shell";
import { buildCalendar } from "@/src/modules/tools/seniat-calendar/utils/calendar-builder";
import { MONTHS_ES_FULL } from "@/src/modules/tools/seniat-calendar/utils/date-helpers";

export const metadata: Metadata = {
    title: "Calendario Tributario SENIAT 2026 | Fechas por RIF | Konta",
    description:
        "Consulta el calendario tributario SENIAT 2026 personalizado según el último dígito de tu RIF. Contribuyentes Ordinarios y Sujetos Pasivos Especiales. Exporta a PDF, imagen o Google Calendar. Gratis, sin registro.",
    keywords: [
        "calendario SENIAT 2026",
        "calendario sujetos pasivos especiales 2026",
        "fechas IVA Venezuela 2026",
        "retenciones ISLR 2026",
        "providencia SENIAT",
        "calendario fiscal Venezuela",
        "calendario tributario",
        "impuestos Venezuela RIF",
    ],
    alternates: { canonical: "/herramientas/calendario-seniat" },
    openGraph: {
        type: "website",
        locale: "es_VE",
        title: "Calendario Tributario SENIAT 2026 — Konta",
        description:
            "Consulta tus fechas de declaración y pago de IVA, ISLR, IGTF y más para Venezuela 2026. Personalizado por RIF. Gratis, sin registro.",
        siteName: "Konta",
    },
    twitter: {
        card: "summary_large_image",
        title: "Calendario Tributario SENIAT 2026",
        description:
            "Fechas de declaración y pago de impuestos en Venezuela. Personalizado por último dígito del RIF. Gratis.",
    },
    robots: { index: true, follow: true },
};

// SSR: build a sample calendar for digit 0 (SEO-agnostic) to expose dates in plain text
function getSeoEntries() {
    try {
        return buildCalendar({ year: 2026, lastDigit: 0, taxpayerType: "especial" });
    } catch {
        return [];
    }
}

const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "WebApplication",
            name: "Calendario Tributario SENIAT 2026",
            url: "https://konta.app/herramientas/calendario-seniat",
            applicationCategory: "FinanceApplication",
            operatingSystem: "Web",
            description:
                "Consulta el calendario tributario SENIAT 2026 personalizado según el RIF. IVA, ISLR, IGTF y más obligaciones para contribuyentes ordinarios y sujetos pasivos especiales.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            inLanguage: "es-VE",
        },
        {
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "Konta", item: "https://konta.app/" },
                { "@type": "ListItem", position: 2, name: "Herramientas", item: "https://konta.app/herramientas" },
                {
                    "@type": "ListItem",
                    position: 3,
                    name: "Calendario Tributario SENIAT",
                    item: "https://konta.app/herramientas/calendario-seniat",
                },
            ],
        },
        {
            "@type": "FAQPage",
            mainEntity: [
                {
                    "@type": "Question",
                    name: "¿Qué es el Calendario Tributario SENIAT?",
                    acceptedAnswer: {
                        "@type": "Answer",
                        text: "Es el cronograma oficial de fechas de declaración y pago de impuestos publicado anualmente por el SENIAT. Define cuándo deben declarar y pagar IVA, ISLR, IGTF y otras obligaciones los contribuyentes venezolanos.",
                    },
                },
                {
                    "@type": "Question",
                    name: "¿Por qué las fechas varían según el RIF?",
                    acceptedAnswer: {
                        "@type": "Answer",
                        text: "Para los Sujetos Pasivos Especiales, el SENIAT asigna fechas de pago diferenciadas según el último dígito del RIF (dígito verificador), para evitar saturación del sistema bancario.",
                    },
                },
                {
                    "@type": "Question",
                    name: "¿Es gratis esta herramienta?",
                    acceptedAnswer: {
                        "@type": "Answer",
                        text: "Sí, el Calendario Tributario SENIAT de Konta es 100% gratuito y no requiere registro para consultar las fechas.",
                    },
                },
                {
                    "@type": "Question",
                    name: "¿Cómo exporto mi calendario tributario?",
                    acceptedAnswer: {
                        "@type": "Answer",
                        text: "Puedes exportar tu calendario en tres formatos: PNG (imagen), PDF (resumen en documento) e ICS (archivo iCalendar compatible con Google Calendar, Apple Calendar y Outlook).",
                    },
                },
            ],
        },
        {
            "@type": "Dataset",
            name: "Calendario Tributario SENIAT 2026",
            description: "Fechas de obligaciones tributarias para Venezuela 2026 según la Providencia Administrativa SNAT/2025/000091 publicada en Gaceta Oficial Nº 43.273 del 09/12/2025",
            url: "https://konta.app/herramientas/calendario-seniat",
            creator: { "@type": "Organization", name: "Konta", url: "https://konta.app" },
            license: "https://creativecommons.org/licenses/by/4.0/",
            temporalCoverage: "2026",
            spatialCoverage: "Venezuela",
        },
    ],
};

export default function CalendarioSeniatPage() {
    const seoEntries = getSeoEntries();
    // Compute the next 4 key dates from the sample calendar
    const upcoming = seoEntries.slice(0, 4);

    return (
        <>
            {/* Plain-text block for search engine indexing */}
            <div className="sr-only" aria-hidden="true">
                <h1>Calendario Tributario SENIAT 2026 Venezuela</h1>
                <p>Fechas de declaración y pago de IVA, ISLR, IGTF y retenciones para 2026.</p>
                {upcoming.map((entry) => {
                    const [, monthStr, dayStr] = entry.dueDate.split("-");
                    const month = MONTHS_ES_FULL[parseInt(monthStr, 10) - 1];
                    const day = parseInt(dayStr, 10);
                    return (
                        <p key={`${entry.obligationId}-${entry.dueDate}`}>
                            {entry.title}: {day} de {month} de 2026
                        </p>
                    );
                })}
            </div>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <Suspense>
                <SeniatCalendarShell variant="public" />
            </Suspense>
        </>
    );
}
