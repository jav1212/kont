import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceDetail } from "@/src/modules/tools/frontend/status/components/service-detail";
import { getSupabaseServer } from "@/app/api/status/_lib";

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const supabase = getSupabaseServer();
    const { data: service } = await supabase
        .from("status_services")
        .select("name, description")
        .eq("slug", slug)
        .maybeSingle();

    if (!service) return { title: "Servicio no encontrado | Kontave" };

    const title = `Estatus de ${service.name} | Kontave`;
    const description = service.description ?? `Disponibilidad y latencia de ${service.name} en tiempo real.`;

    return {
        title,
        description,
        alternates: { canonical: `/herramientas/status/${slug}` },
        openGraph: { title, description, type: "website", locale: "es_VE", siteName: "Kontave" },
        robots: { index: true, follow: true },
    };
}

export default async function Page({ params }: Props) {
    const { slug } = await params;
    const supabase = getSupabaseServer();
    const { data: service } = await supabase
        .from("status_services")
        .select("slug")
        .eq("slug", slug)
        .maybeSingle();

    if (!service) notFound();

    return (
        <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
            <ServiceDetail slug={slug} hrefBase="/herramientas/status" backLabel="Volver al estatus" />
        </div>
    );
}
