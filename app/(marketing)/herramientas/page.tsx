import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Herramientas gratuitas para contadores venezolanos | Kontave",
    description:
        "Calculadora de divisas BCV, calendario tributario SENIAT 2026 por RIF y estatus en tiempo real de portales gubernamentales venezolanos. Gratis, sin registro. Por Kontave.",
    keywords: [
        "herramientas contadores Venezuela",
        "calculadora divisas BCV",
        "calendario SENIAT 2026",
        "estatus SENIAT",
        "herramientas fiscales Venezuela",
        "herramientas gratis contador",
        "Kontave herramientas",
    ],
    alternates: { canonical: "/herramientas" },
    openGraph: {
        type: "website",
        locale: "es_VE",
        url: "https://kontave.com/herramientas",
        title: "Herramientas gratuitas para contadores venezolanos | Kontave",
        description:
            "Calculadora de divisas BCV, calendario tributario SENIAT 2026 y estatus de portales venezolanos. Gratis, sin registro.",
        siteName: "Kontave",
    },
    twitter: {
        card: "summary_large_image",
        title: "Herramientas gratuitas de Kontave",
        description: "Divisas BCV, Calendario SENIAT y estatus de portales venezolanos. Gratis.",
    },
    robots: { index: true, follow: true },
};

interface Tool {
    href: string;
    name: string;
    tagline: string;
    description: string;
    keywords: string[];
}

const TOOLS: Tool[] = [
    {
        href: "/herramientas/divisas",
        name: "Calculadora de Divisas BCV",
        tagline: "Tasa oficial USD, EUR, CNY y más",
        description:
            "Convierte Bolívares a 10+ monedas con la tasa oficial del Banco Central de Venezuela. Histórico de 30 días, conversión cruzada y tabla de equivalencias en tiempo real.",
        keywords: ["Tasa BCV", "USD", "EUR", "Histórico 30 días"],
    },
    {
        href: "/herramientas/calendario-seniat",
        name: "Calendario Tributario SENIAT 2026",
        tagline: "Fechas personalizadas según tu RIF",
        description:
            "Consulta el calendario oficial del SENIAT 2026 según el último dígito de tu RIF. Contribuyentes Ordinarios y Sujetos Pasivos Especiales. Exporta a PDF, imagen o Google Calendar.",
        keywords: ["IVA", "ISLR", "IGTF", "Especiales", "Exportable"],
    },
    {
        href: "/herramientas/status",
        name: "Estatus de portales venezolanos",
        tagline: "¿SENIAT caído? Verifica en tiempo real",
        description:
            "Disponibilidad en tiempo real de SENIAT, IVSS, INCES, BANAVIH, MinTra, SAREN, SUDEBAN y BCV. Verifica si el portal está caído antes de declarar.",
        keywords: ["SENIAT", "IVSS", "INCES", "Tiempo real"],
    },
];

const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "CollectionPage",
            "@id": "https://kontave.com/herramientas#page",
            url: "https://kontave.com/herramientas",
            name: "Herramientas gratuitas para contadores venezolanos",
            description:
                "Colección de herramientas gratuitas de Kontave para contadores y empresas en Venezuela: divisas BCV, calendario SENIAT 2026 y estatus de portales gubernamentales.",
            inLanguage: "es-VE",
            isPartOf: { "@id": "https://kontave.com/#website" },
            publisher: { "@id": "https://kontave.com/#organization" },
        },
        {
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "Kontave", item: "https://kontave.com/" },
                { "@type": "ListItem", position: 2, name: "Herramientas", item: "https://kontave.com/herramientas" },
            ],
        },
        {
            "@type": "ItemList",
            name: "Herramientas gratuitas de Kontave",
            itemListElement: TOOLS.map((t, i) => ({
                "@type": "ListItem",
                position: i + 1,
                item: {
                    "@type": "WebApplication",
                    name: t.name,
                    url: `https://kontave.com${t.href}`,
                    description: t.description,
                    applicationCategory: "BusinessApplication",
                    operatingSystem: "Web",
                    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                    inLanguage: "es-VE",
                },
            })),
        },
    ],
};

export default function HerramientasPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-12 sm:py-20">
                {/* Hero */}
                <div className="mb-12 sm:mb-16 max-w-3xl">
                    <span className="inline-block font-mono text-[11px] uppercase tracking-[0.2em] text-primary-500 mb-4">
                        Herramientas · Gratis · Sin registro
                    </span>
                    <h1 className="text-[32px] sm:text-[44px] lg:text-[52px] font-bold leading-[1.1] tracking-tight text-foreground mb-5">
                        Herramientas gratuitas para contadores{" "}
                        <span className="text-primary-500">venezolanos</span>
                    </h1>
                    <p className="text-[16px] sm:text-[18px] text-text-tertiary leading-relaxed max-w-2xl">
                        Creadas por <strong className="text-foreground">Kontave</strong> para facilitar el día a día de
                        contadores y empresas en Venezuela. Tasa BCV, calendario SENIAT por RIF y estatus de portales
                        gubernamentales — todo sin registro.
                    </p>
                </div>

                {/* Tools grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {TOOLS.map((tool) => (
                        <Link
                            key={tool.href}
                            href={tool.href}
                            className="group relative flex flex-col rounded-2xl border border-border-light bg-surface-1 p-6 sm:p-7 hover:border-primary-500/40 hover:bg-surface-2 transition-colors"
                        >
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-500 mb-3">
                                {tool.tagline}
                            </span>
                            <h2 className="text-[20px] sm:text-[22px] font-bold text-foreground leading-tight mb-3">
                                {tool.name}
                            </h2>
                            <p className="text-[14px] text-text-tertiary leading-relaxed mb-5 flex-1">
                                {tool.description}
                            </p>
                            <div className="flex flex-wrap gap-2 mb-5">
                                {tool.keywords.map((k) => (
                                    <span
                                        key={k}
                                        className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-secondary bg-surface-2 border border-border-light rounded-full px-2.5 py-1"
                                    >
                                        {k}
                                    </span>
                                ))}
                            </div>
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-foreground group-hover:text-primary-500 transition-colors">
                                Abrir herramienta
                                <svg
                                    className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                            </span>
                        </Link>
                    ))}
                </div>

                {/* Brand footer callout */}
                <div className="mt-16 sm:mt-24 pt-10 border-t border-border-light max-w-2xl">
                    <h2 className="text-[20px] sm:text-[24px] font-bold text-foreground mb-3">
                        ¿Necesitas más que herramientas?
                    </h2>
                    <p className="text-[15px] text-text-tertiary leading-relaxed mb-5">
                        <strong className="text-foreground">Kontave</strong> es el software contable todo-en-uno para
                        Venezuela: contabilidad, nómina, inventario y documentos en una sola plataforma.
                    </p>
                    <div className="flex items-center gap-3">
                        <Link
                            href="/sign-up"
                            className="inline-flex items-center h-10 px-5 bg-foreground text-background rounded-full font-bold text-[13px] hover:bg-foreground/90 transition-colors"
                        >
                            Crear cuenta gratis
                        </Link>
                        <Link
                            href="/"
                            className="inline-flex items-center h-10 px-5 rounded-full font-bold text-[13px] text-text-secondary hover:text-foreground transition-colors"
                        >
                            Conocer Kontave
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
