"use client";
 
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
 
const NAV_LINKS = [
    { href: "/settings/company", label: "Empresa" },
    { href: "/settings/members", label: "Miembros" },
    { href: "/settings/billing", label: "Facturación" },
    { href: "/settings/referrals", label: "Referidos" },
    { href: "/settings/apariencia", label: "Apariencia" },
];
 
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
 
    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-surface-2">
            <PageHeader 
                title="Configuración" 
                subtitle="Gestiona los detalles de tu empresa, miembros y preferencias personales."
            />
            
            <div className="flex-1 overflow-y-auto px-6 py-10">
                <div className="max-w-4xl mx-auto h-full flex flex-col">
                    {/* Horizontal Tabs */}
                    <nav
                        aria-label="Navegación de configuración"
                        className="flex items-center gap-8 border-b border-border-light mb-8 pt-2"
                    >
                        {NAV_LINKS.map(({ href, label }) => {
                            const isActive = pathname.startsWith(href);
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    aria-current={isActive ? "page" : undefined}
                                    className={[
                                        "pb-4 text-[10px] font-bold uppercase tracking-[0.16em] transition-all duration-200 relative",
                                        isActive
                                            ? "text-primary-500"
                                            : "text-foreground/40 hover:text-foreground/60"
                                    ].join(" ")}
                                >
                                    {label}
                                    {isActive && (
                                        <motion.div 
                                            layoutId="settings-nav-indicator"
                                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full" 
                                        />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>
 
                    {/* Page content */}
                    <main className="min-w-0 flex-1">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}

