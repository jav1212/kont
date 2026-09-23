"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Store } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

interface KioskPlan {
    readonly id: string;
    readonly name: string;
    readonly priceMonthlyUsd: number;
    readonly isContactOnly?: boolean;
    readonly includedModules?: readonly string[];
    readonly commercialCode?: string;
}

const KIOSK_MODULES = ["sales", "purchases", "inventory"] as const;
const KIOSK_FEATURES = [
    ["Ventas", "Registra cada venta desde el punto de venta."],
    ["Compras", "Mantén las reposiciones y proveedores al día."],
    ["Inventario", "Consulta existencias y movimientos por producto."],
] as const;

/** Renders Kontave's commercial presentation for independently operated kiosks. */
export default function KioskMarketingPage() {
    const [plan, setPlan] = useState<KioskPlan | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let active = true;
        void fetch("/api/billing/plans")
            .then((response) => response.json())
            .then((payload: { data?: readonly KioskPlan[] }) => {
                const kiosk = payload.data?.find((candidate) => candidate.commercialCode === "kiosk" || candidate.name.toLocaleLowerCase("es-VE") === "kiosco");
                if (active) setPlan(kiosk ?? null);
            })
            .catch(() => undefined)
            .finally(() => { if (active) setLoaded(true); });
        return () => { active = false; };
    }, []);

    const canContract = Boolean(
        plan
        && !plan.isContactOnly
        && plan.priceMonthlyUsd > 0
        && KIOSK_MODULES.every((module) => plan.includedModules?.includes(module)),
    );

    return (
        <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24 font-mono">
            <section className="grid gap-10 rounded-[2rem] border border-border-default bg-surface-1 p-8 md:grid-cols-[1.2fr_0.8fr] md:p-14">
                <div>
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-500/25 bg-primary-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-primary-500">
                        <Store size={14} /> Kontave Kiosco
                    </div>
                    <h1 className="font-sans text-4xl font-black leading-tight tracking-tight text-foreground md:text-6xl">
                        Compra, vende y controla tu inventario desde un solo lugar.
                    </h1>
                    <p className="mt-6 max-w-2xl font-sans text-[17px] leading-relaxed text-text-tertiary">
                        Una operación simple para kioscos y comercios de atención rápida: registra ventas, repone mercancía y consulta tu stock sin cambiar de herramienta.
                    </p>
                    <div className="mt-9 flex flex-wrap gap-3">
                        {canContract ? (
                            <BaseButton.Root as={Link} href="/sign-up?redirect=%2Fcompanies%3FoperatingProfile%3Dkiosk" variant="primary" className="h-12 rounded-full px-7">
                                Crear cuenta y contratar
                            </BaseButton.Root>
                        ) : (
                            <BaseButton.Root as={Link} href="/sign-up" variant="primary" className="h-12 rounded-full px-7">
                                Crear cuenta
                            </BaseButton.Root>
                        )}
                        <BaseButton.Root as={Link} href="/#planes" variant="outline" className="h-12 rounded-full px-7">
                            Ver planes
                        </BaseButton.Root>
                    </div>
                    {loaded && !canContract && (
                        <p className="mt-4 font-sans text-[13px] text-text-tertiary">
                            El paquete Kiosco estará disponible para contratación cuando su precio y publicación estén configurados.
                        </p>
                    )}
                </div>

                <div className="grid gap-3 self-center">
                    {KIOSK_FEATURES.map(([title, description]) => (
                        <div key={title} className="rounded-2xl border border-border-light bg-background p-5">
                            <div className="flex items-center gap-2 text-primary-500"><Check size={16} strokeWidth={3} /><span className="text-[12px] font-bold uppercase tracking-[0.14em]">{title}</span></div>
                            <p className="mt-2 font-sans text-[14px] leading-relaxed text-text-tertiary">{description}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
