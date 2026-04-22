"use client";

import { use } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { ServiceDetail } from "@/src/modules/tools/frontend/status/components/service-detail";

interface Props {
    params: Promise<{ slug: string }>;
}

export default function StatusDetailPage({ params }: Props) {
    const { slug } = use(params);
    return (
        <div className="flex flex-col min-h-full bg-surface-2 selection:bg-primary-500/30 font-mono">
            <PageHeader title="Detalle de Portal" subtitle={slug.toUpperCase()} />
            <div className="max-w-[1200px] mx-auto w-full px-8 py-8">
                <ServiceDetail slug={slug} hrefBase="/tools/status" backLabel="Volver al estatus" />
            </div>
        </div>
    );
}
