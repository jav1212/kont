"use client";

import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import {
    Building2,
    Boxes,
    Users,
    CreditCard,
    Gift,
    Palette,
    type LucideIcon,
} from "lucide-react";

interface NavLink {
    href:     string;
    label:    string;
    subtitle: string;
    icon:     LucideIcon;
}

interface NavGroup {
    label: string;
    items: ReadonlyArray<NavLink>;
}

const NAV_GROUPS: ReadonlyArray<NavGroup> = [
    {
        label: "Empresa",
        items: [
            { href: "/settings/company",          label: "Empresa",     subtitle: "Datos y opciones de los reportes PDF.",        icon: Building2 },
            { href: "/settings/inventory-config", label: "Inventario",  subtitle: "Campos personalizados visibles en productos.", icon: Boxes      },
            { href: "/settings/members",          label: "Miembros",    subtitle: "Roles, invitaciones y accesos de tu cuenta.",  icon: Users      },
        ],
    },
    {
        label: "Cuenta",
        items: [
            { href: "/settings/billing",    label: "Facturación", subtitle: "Plan activo, pagos y solicitudes de suscripción.", icon: CreditCard },
            { href: "/settings/referrals",  label: "Referidos",   subtitle: "Invita a otros profesionales y gana crédito.",     icon: Gift       },
            { href: "/settings/apariencia", label: "Apariencia",  subtitle: "Tema y preferencias visuales (este navegador).",   icon: Palette    },
        ],
    },
];

const ALL_LINKS: ReadonlyArray<NavLink> = NAV_GROUPS.flatMap((g) => g.items);
const FALLBACK_SUBTITLE = "Gestiona tu empresa, miembros y preferencias personales.";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const active   = ALL_LINKS.find(({ href }) => pathname.startsWith(href));

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-surface-2">
            <PageHeader
                title="Configuración"
                subtitle={active?.subtitle ?? FALLBACK_SUBTITLE}
            />

            {/* Mobile: tira de pestañas horizontal con scroll. Por debajo de lg el rail se oculta. */}
            <nav
                aria-label="Navegación de configuración"
                className="lg:hidden shrink-0 border-b border-border-light bg-surface-1 overflow-x-auto"
            >
                <ul className="flex items-center gap-1 px-4 py-2 min-w-max">
                    {ALL_LINKS.map(({ href, label, icon: Icon }) => {
                        const isActive = pathname.startsWith(href);
                        return (
                            <li key={href}>
                                <Link
                                    href={href}
                                    aria-current={isActive ? "page" : undefined}
                                    className={[
                                        "inline-flex items-center gap-2 h-8 px-3",
                                        "rounded-lg border font-mono text-[12px] font-semibold tracking-[0.02em] whitespace-nowrap",
                                        "transition-colors duration-150",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
                                        isActive
                                            ? "border-primary-200 bg-primary-100 text-primary-600 shadow-sm"
                                            : "border-transparent text-[var(--text-secondary)] hover:bg-surface-2 hover:text-foreground",
                                    ].join(" ")}
                                >
                                    <Icon
                                        className={[
                                            "w-3.5 h-3.5 shrink-0",
                                            isActive ? "text-primary-500" : "text-[var(--text-tertiary)]",
                                        ].join(" ")}
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                    <span>{label}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            <div className="flex-1 min-h-0 flex">
                {/* Rail vertical — patrón clásico de settings, escala a N items sin scroll horizontal. */}
                <aside
                    aria-label="Navegación de configuración"
                    className="hidden lg:flex shrink-0 w-[232px] flex-col border-r border-border-light bg-surface-1 overflow-y-auto"
                >
                    <nav className="flex flex-col gap-6 p-4">
                        {NAV_GROUPS.map((group) => (
                            <div key={group.label} className="flex flex-col gap-1">
                                <div className="px-3 pb-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                                    {group.label}
                                </div>
                                {group.items.map(({ href, label, icon: Icon }) => {
                                    const isActive = pathname.startsWith(href);
                                    return (
                                        <Link
                                            key={href}
                                            href={href}
                                            aria-current={isActive ? "page" : undefined}
                                            className={[
                                                "group relative inline-flex items-center gap-2.5 h-9 pl-3 pr-3",
                                                "rounded-lg border font-mono text-[13px] font-semibold tracking-[0.02em]",
                                                "transition-colors duration-150",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
                                                isActive
                                                    ? "border-primary-200 bg-primary-100 text-primary-600 shadow-sm"
                                                    : "border-transparent text-[var(--text-secondary)] hover:bg-surface-2 hover:text-foreground",
                                            ].join(" ")}
                                        >
                                            {/* Acento naranja a la izquierda en activo — el "tab" del rail. */}
                                            <span
                                                aria-hidden
                                                className={[
                                                    "absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full transition-colors duration-150",
                                                    isActive ? "bg-primary-500" : "bg-transparent",
                                                ].join(" ")}
                                            />
                                            <Icon
                                                className={[
                                                    "w-4 h-4 shrink-0 transition-colors duration-150",
                                                    isActive ? "text-primary-500" : "text-[var(--text-tertiary)] group-hover:text-foreground",
                                                ].join(" ")}
                                                strokeWidth={2}
                                                aria-hidden
                                            />
                                            <span className="truncate">{label}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        ))}
                    </nav>
                </aside>

                {/* Contenido */}
                <div className="flex-1 min-w-0 overflow-y-auto">
                    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 pt-6 lg:pt-10 pb-16">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
