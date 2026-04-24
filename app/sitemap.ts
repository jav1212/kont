import type { MetadataRoute } from "next";
import { getSupabaseServer } from "@/app/api/status/_lib";

const SITE_URL = "https://kontave.com";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const now = new Date();

    const staticRoutes: MetadataRoute.Sitemap = [
        {
            url:            SITE_URL,
            lastModified:   now,
            changeFrequency: "weekly",
            priority:       1.0,
        },
        {
            url:            `${SITE_URL}/herramientas`,
            lastModified:   now,
            changeFrequency: "weekly",
            priority:       0.9,
        },
        {
            url:            `${SITE_URL}/herramientas/calendario-seniat`,
            lastModified:   now,
            changeFrequency: "daily",
            priority:       0.9,
        },
        {
            url:            `${SITE_URL}/herramientas/divisas`,
            lastModified:   now,
            changeFrequency: "daily",
            priority:       0.8,
        },
        {
            url:            `${SITE_URL}/herramientas/status`,
            lastModified:   now,
            changeFrequency: "hourly",
            priority:       0.6,
        },
    ];

    let statusRoutes: MetadataRoute.Sitemap = [];
    try {
        const supabase = getSupabaseServer();
        const { data } = await supabase
            .from("status_services")
            .select("slug")
            .eq("active", true);

        statusRoutes = (data ?? []).map((svc) => ({
            url:            `${SITE_URL}/herramientas/status/${svc.slug}`,
            lastModified:   now,
            changeFrequency: "hourly",
            priority:       0.4,
        }));
    } catch {
        // Si falla la consulta (ej: en build sin env vars), no rompemos el sitemap.
    }

    return [...staticRoutes, ...statusRoutes];
}
