import type { Metadata } from "next";
import { ToolsShell } from "@/src/modules/tools/frontend/components/tools-shell";
import { ALLOWED_CODES, fetchBcvCurrentAll, normalizeEntry, type NormalizedRate } from "@/app/api/bcv/_lib";
import { formatRate } from "@/src/modules/tools/frontend/utils/format-number";

export const revalidate = 3600;

export const metadata: Metadata = {
    title: "Calculadora de Divisas BCV | Tasa Oficial USD, EUR, CNY | Konta",
    description:
        "Convierte Bolívares a USD, EUR, CNY, GBP, JPY y más con la tasa oficial del BCV actualizada diariamente. Histórico de 30 días, conversión cruzada y tabla de equivalencias en tiempo real. Gratis.",
    keywords: [
        "tasa BCV hoy",
        "dólar BCV",
        "euro BCV",
        "calculadora divisas Venezuela",
        "bolívar dólar",
        "conversor BCV",
        "tasa oficial Venezuela",
        "cambio dólar bolívar",
    ],
    alternates: { canonical: "/herramientas/divisas" },
    openGraph: {
        type: "website",
        locale: "es_VE",
        title: "Calculadora de Divisas BCV en tiempo real",
        description: "Tasa oficial BCV para 10+ monedas. Actualizada diariamente. Gratis, sin registro.",
        siteName: "Konta",
    },
    twitter: {
        card: "summary_large_image",
        title: "Calculadora de Divisas BCV",
        description: "Tasa oficial BCV en tiempo real. Gratis, sin registro.",
    },
    robots: { index: true, follow: true },
};

async function getInitialRates(): Promise<{ date: string; rates: NormalizedRate[] } | null> {
    try {
        const all = await fetchBcvCurrentAll({ revalidate: 1800 });
        const rates = all
            .filter((e) => (ALLOWED_CODES as readonly string[]).includes(e.code))
            .map(normalizeEntry);
        if (!rates.length) return null;
        return { date: rates[0].date, rates };
    } catch {
        return null;
    }
}

export default async function Page() {
    const initial = await getInitialRates();
    const usd = initial?.rates.find((r) => r.code === "USD");
    const eur = initial?.rates.find((r) => r.code === "EUR");

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebApplication",
                name: "Calculadora de Divisas BCV",
                url: "/herramientas/divisas",
                applicationCategory: "FinanceApplication",
                operatingSystem: "Web",
                description:
                    "Conversor gratuito de bolívares a dólares, euros y otras divisas usando la tasa oficial del Banco Central de Venezuela.",
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                inLanguage: "es-VE",
            },
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Konta", item: "/" },
                    { "@type": "ListItem", position: 2, name: "Herramientas", item: "/herramientas" },
                    { "@type": "ListItem", position: 3, name: "Calculadora de Divisas", item: "/herramientas/divisas" },
                ],
            },
            {
                "@type": "FAQPage",
                mainEntity: [
                    {
                        "@type": "Question",
                        name: "¿Qué es la tasa BCV?",
                        acceptedAnswer: {
                            "@type": "Answer",
                            text: "Es la tasa oficial de cambio publicada por el Banco Central de Venezuela. Es la referencia legal para operaciones contables y fiscales en el país.",
                        },
                    },
                    {
                        "@type": "Question",
                        name: "¿Con qué frecuencia se actualiza la tasa BCV?",
                        acceptedAnswer: {
                            "@type": "Answer",
                            text: "El BCV publica tasas en días hábiles. Esta calculadora sincroniza automáticamente con la última publicación disponible.",
                        },
                    },
                    {
                        "@type": "Question",
                        name: "¿La calculadora de divisas es gratis?",
                        acceptedAnswer: {
                            "@type": "Answer",
                            text: "Sí. Es 100% gratuita y no requiere registro para ser usada.",
                        },
                    },
                    {
                        "@type": "Question",
                        name: "¿Qué monedas soporta?",
                        acceptedAnswer: {
                            "@type": "Answer",
                            text: "Las que publica el BCV: USD, EUR, CNY, GBP, JPY, CAD, MXN, BRL, AED, TRY y RUB, entre otras.",
                        },
                    },
                ],
            },
        ],
    };

    return (
        <>
            {/* Plain-text rates block for search engine indexing.
                Rendered with sr-only + aria-hidden to avoid visual duplication — the
                interactive shell below shows the same data with proper styling. */}
            <div className="sr-only" aria-hidden="true">
                {usd && <p>Tasa BCV del dólar hoy: Bs. {formatRate(usd.sell)}</p>}
                {eur && <p>Tasa BCV del euro hoy: Bs. {formatRate(eur.sell)}</p>}
                {initial?.date && <p>Fecha de la tasa: {initial.date}</p>}
            </div>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <ToolsShell variant="public" initialData={initial} />
        </>
    );
}
