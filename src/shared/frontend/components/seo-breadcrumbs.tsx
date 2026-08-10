"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
    herramientas: "Herramientas",
    divisas: "Divisas BCV",
    "calendario-seniat": "Calendario SENIAT",
    status: "Estatus de portales",
    legal: "Legal",
    privacidad: "Privacidad",
    terminos: "Términos",
};

export function SeoBreadcrumbs() {
    const pathname = usePathname() ?? "/";
    const segments = pathname.split("/").filter(Boolean);
    if (!segments.length) return null;

    return (
        <nav aria-label="Migas de pan" className="mx-auto w-full max-w-[1200px] px-4 pt-5 sm:px-6">
            <ol className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                <li><Link href="/" className="hover:text-foreground">Kontave</Link></li>
                {segments.map((segment, index) => {
                    const href = `/${segments.slice(0, index + 1).join("/")}`;
                    const label = LABELS[segment] ?? segment.replaceAll("-", " ");
                    const last = index === segments.length - 1;
                    return (
                        <li key={href} className="flex items-center gap-2">
                            <span aria-hidden="true">/</span>
                            {last ? <span className="text-foreground">{label}</span> : <Link href={href} className="hover:text-foreground">{label}</Link>}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
