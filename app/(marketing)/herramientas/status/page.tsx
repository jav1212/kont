import type { Metadata } from "next";
import { StatusShell, type StatusFilter } from "@/src/modules/tools/frontend/status/components/status-shell";
import { getSupabaseServer, aggregateBucket, type ServiceStatus } from "@/app/api/status/_lib";
import type { ServicesResponse, ServiceWithStatus } from "@/app/api/status/services/route";

const VALID_FILTERS: readonly StatusFilter[] = ["operational", "degraded", "down"];

export const revalidate = 60;

export const metadata: Metadata = {
    title: "Estatus de SENIAT, IVSS, INCES y otros portales venezolanos | Konta",
    description:
        "Disponibilidad en tiempo real de SENIAT, IVSS, INCES, BANAVIH, MinTra, SAREN, SUDEBAN y BCV. Verifica si el portal está caído antes de declarar. Gratis, sin registro.",
    keywords: [
        "seniat caido",
        "seniat no funciona",
        "portal ivss caido",
        "inces funciona",
        "banavih caido",
        "saren caido",
        "mintra funciona",
        "estatus portales venezuela",
        "caida seniat hoy",
    ],
    alternates: { canonical: "/herramientas/status" },
    openGraph: {
        type: "website",
        locale: "es_VE",
        title: "Estatus de portales gubernamentales venezolanos",
        description: "¿SENIAT está caído? Disponibilidad en tiempo real de los portales más usados por contadores en Venezuela.",
        siteName: "Konta",
    },
    twitter: {
        card: "summary_large_image",
        title: "Estatus de portales venezolanos",
        description: "Verifica si SENIAT, IVSS, INCES y otros portales están operativos.",
    },
    robots: { index: true, follow: true },
};

async function getInitialData(): Promise<ServicesResponse | null> {
    try {
        const supabase = getSupabaseServer();
        const { data: services } = await supabase
            .from("status_services")
            .select("*")
            .eq("active", true)
            .order("display_order", { ascending: true });

        if (!services?.length) return null;

        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 90);

        const { data: checks } = await supabase
            .from("status_checks")
            .select("service_id, checked_at, status, response_time_ms, source")
            .gte("checked_at", since.toISOString())
            .order("checked_at", { ascending: false })
            .limit(50_000);

        const byService = new Map<string, typeof checks>();
        for (const c of checks ?? []) {
            const list = byService.get(c.service_id) ?? [];
            list.push(c);
            byService.set(c.service_id, list);
        }

        const enriched: ServiceWithStatus[] = services.map((svc) => {
            const svcChecks = byService.get(svc.id) ?? [];
            const last = svcChecks[0];
            const byDay = new Map<string, { status: ServiceStatus; response_time_ms: number | null }[]>();
            for (const c of svcChecks) {
                const day = c.checked_at.slice(0, 10);
                const list = byDay.get(day) ?? [];
                list.push({ status: c.status as ServiceStatus, response_time_ms: c.response_time_ms });
                byDay.set(day, list);
            }
            const buckets: { date: string; status: ServiceStatus | null; avgMs: number | null }[] = [];
            const today = new Date();
            for (let i = 89; i >= 0; i--) {
                const d = new Date(today);
                d.setUTCDate(today.getUTCDate() - i);
                const iso = d.toISOString().slice(0, 10);
                const list = byDay.get(iso) ?? [];
                const agg = aggregateBucket(list);
                buckets.push({ date: iso, status: agg.status, avgMs: agg.avg_ms });
            }
            return {
                id: svc.id,
                slug: svc.slug,
                name: svc.name,
                description: svc.description,
                url: svc.url,
                category: svc.category,
                logoUrl: svc.logo_url,
                displayOrder: svc.display_order,
                lastStatus: (last?.status as ServiceStatus) ?? null,
                lastResponseMs: last?.response_time_ms ?? null,
                lastCheckedAt: last?.checked_at ?? null,
                lastSource: (last?.source as "server" | "client") ?? null,
                uptimeBuckets: buckets,
            };
        });

        const summary = enriched.reduce(
            (acc, s) => {
                if (s.lastStatus === "operational") acc.operational++;
                else if (s.lastStatus === "degraded") acc.degraded++;
                else if (s.lastStatus === "down") acc.down++;
                else acc.unknown++;
                acc.total++;
                return acc;
            },
            { operational: 0, degraded: 0, down: 0, unknown: 0, total: 0 },
        );

        const { data: lastServerCheck } = await supabase
            .from("status_checks")
            .select("checked_at")
            .eq("source", "server")
            .order("checked_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        return {
            services: enriched,
            summary,
            lastServerCheckAt: lastServerCheck?.checked_at ?? null,
        };
    } catch {
        return null;
    }
}

interface PageProps {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
    const initial = await getInitialData();
    const params = await searchParams;
    const rawFilter = typeof params?.filter === "string" ? params.filter : null;
    const filter: StatusFilter | null = VALID_FILTERS.includes(rawFilter as StatusFilter)
        ? (rawFilter as StatusFilter)
        : null;

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebApplication",
                name: "Estatus de Portales Venezolanos",
                url: "/herramientas/status",
                applicationCategory: "BusinessApplication",
                operatingSystem: "Web",
                description:
                    "Monitoreo de disponibilidad en tiempo real de portales gubernamentales venezolanos (SENIAT, IVSS, INCES, BANAVIH, MinTra, SAREN, SUDEBAN, BCV).",
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                inLanguage: "es-VE",
            },
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Konta", item: "/" },
                    { "@type": "ListItem", position: 2, name: "Herramientas", item: "/herramientas" },
                    { "@type": "ListItem", position: 3, name: "Estatus", item: "/herramientas/status" },
                ],
            },
            {
                "@type": "FAQPage",
                mainEntity: [
                    {
                        "@type": "Question",
                        name: "¿Cómo sé si SENIAT está caído hoy?",
                        acceptedAnswer: {
                            "@type": "Answer",
                            text: "En esta página verificamos SENIAT y otros portales cada vez que alguien entra, combinando checks desde nuestro servidor con reportes anónimos de visitantes desde Venezuela.",
                        },
                    },
                    {
                        "@type": "Question",
                        name: "¿Qué portales se monitorean?",
                        acceptedAnswer: {
                            "@type": "Answer",
                            text: "SENIAT (principal, declaraciones y facturación), IVSS, INCES, BANAVIH/FAOV, MinTra, SAREN, SUDEBAN y BCV.",
                        },
                    },
                    {
                        "@type": "Question",
                        name: "¿La herramienta es gratis?",
                        acceptedAnswer: { "@type": "Answer", text: "Sí, 100% gratis y sin registro." },
                    },
                ],
            },
        ],
    };

    const summaryText = initial
        ? `${initial.summary.operational} de ${initial.summary.total} portales venezolanos operacionales`
        : "Estatus de portales venezolanos";

    return (
        <>
            <div className="sr-only" aria-hidden="true">
                <p>{summaryText}</p>
                {initial?.services.map((s) => (
                    <p key={s.id}>
                        {s.name}: {s.lastStatus ?? "sin datos"}
                    </p>
                ))}
            </div>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <StatusShell variant="public" initialData={initial} filter={filter} />
        </>
    );
}
