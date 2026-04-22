'use client';

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

interface Plan {
    id:                     string;
    name:                   string;
    moduleSlug:             string | null;
    maxCompanies:           number | null;
    maxEmployeesPerCompany: number | null;
    priceMonthlyUsd:        number;
    priceQuarterlyUsd:      number | null;
    priceAnnualUsd:         number | null;
    isContactOnly?:         boolean;
}

type Cycle = "monthly" | "quarterly" | "annual";

const BILLABLE_MODULES = [
    { slug: "payroll",   label: "Nómina"      },
    { slug: "inventory", label: "Inventario"  },
    { slug: "documents", label: "Documentos"  },
];

const FREE_MODULE_FEATURES: Record<string, string[]> = {
    documents: [
        "Carga y organización de archivos",
        "Carpetas por empresa",
        "Descarga desde cualquier dispositivo",
        "Sin límite de documentos",
    ],
};
const FREE_MODULE_FEATURES_FALLBACK = ["Sin costo adicional"];

const PANEL_ID = "pricing-panel";

const PLAN_ORDER = ["Gratuito", "Estudiante", "Emprendedor", "Contable", "Empresarial"];

function planOrderIndex(name: string): number {
    const idx = PLAN_ORDER.indexOf(name);
    return idx === -1 ? 999 : idx;
}

export default function LandingPage() {

    // --- STATE LOGIC (Retained for functionality) ---
    const [systemMessage] = useState<{ type: 'error' | 'info', text: string } | null>(() => {
        if (typeof window === "undefined") return null;
        const hashParams  = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        const msg = hashParams.get('error_description') ?? queryParams.get('error_description');
        return msg ? { type: 'error', text: msg.replace(/\+/g, ' ') } : null;
    });
    
    const [plans, setPlans] = useState<Plan[]>([]);
    const [plansLoading, setPlansLoading] = useState<boolean>(true);
    const [plansError, setPlansError] = useState<boolean>(false);
    const [cycle, setCycle] = useState<Cycle>("monthly");
    const [activeModule, setActiveModule] = useState<string>("payroll");
    const [tabTransitioning, setTabTransitioning] = useState<boolean>(false);

    useEffect(() => {
        fetch("/api/billing/plans")
            .then((r) => r.json())
            .then((r) => {
                if (r.data) setPlans(r.data);
                else setPlansError(true);
            })
            .catch(() => setPlansError(true))
            .finally(() => setPlansLoading(false));
    }, []);

    const visiblePlans = useMemo(() => {
        return plans
            .filter((p) => p.moduleSlug === activeModule || p.moduleSlug === null)
            .slice()
            .sort((a, b) => planOrderIndex(a.name) - planOrderIndex(b.name));
    }, [plans, activeModule]);

    const activeModuleIsFree = !plansLoading && !plansError && visiblePlans.length === 0;

    const avgSavings = useMemo(() => {
        const withQuarterly = plans.filter((p) => p.priceQuarterlyUsd);
        const withAnnual    = plans.filter((p) => p.priceAnnualUsd);
        const quarterly = withQuarterly.length
            ? Math.round(withQuarterly.reduce((acc, p) => acc + (1 - p.priceQuarterlyUsd! / (p.priceMonthlyUsd * 3)), 0) / withQuarterly.length * 100)
            : null;
        const annual = withAnnual.length
            ? Math.round(withAnnual.reduce((acc, p) => acc + (1 - p.priceAnnualUsd! / (p.priceMonthlyUsd * 12)), 0) / withAnnual.length * 100)
            : null;
        return { quarterly, annual };
    }, [plans]);

    function changeTab(slug: string) {
        if (slug === activeModule) return;
        setTabTransitioning(true);
        setTimeout(() => {
            setActiveModule(slug);
            setTabTransitioning(false);
        }, 80);
    }

    function planPrice(p: Plan): number {
        if (cycle === "quarterly" && p.priceQuarterlyUsd) return p.priceQuarterlyUsd;
        if (cycle === "annual"    && p.priceAnnualUsd)    return p.priceAnnualUsd;
        return p.priceMonthlyUsd;
    }

    function planSavings(p: Plan): string | null {
        if (cycle === "quarterly" && p.priceQuarterlyUsd) {
            const pct = Math.round((1 - p.priceQuarterlyUsd / (p.priceMonthlyUsd * 3)) * 100);
            return pct > 0 ? `-${pct}%` : null;
        }
        if (cycle === "annual" && p.priceAnnualUsd) {
            const pct = Math.round((1 - p.priceAnnualUsd / (p.priceMonthlyUsd * 12)) * 100);
            return pct > 0 ? `-${pct}%` : null;
        }
        return null;
    }

    // --- ACCORDION FAQ STATE ---
    const [openFaq, setOpenFaq] = useState<number | null>(0);


    return (
        <div className="flex flex-col bg-background text-foreground selection:bg-primary-500/30 font-mono">
            
            {/* System Message Overlay */}
            {systemMessage && (
                <div className="w-full bg-red-500/10 border-b border-red-500/20 px-8 py-3 shrink-0 z-50 fixed top-0 left-0 right-0">
                    <div className="max-w-7xl mx-auto flex items-center gap-4">
                        <span className="text-[12px] text-red-500 font-bold uppercase tracking-widest">[ ERROR ]</span>
                        <span className="text-[13px] text-red-800 dark:text-red-200">{systemMessage.text}</span>
                            [ CERRAR ]
                    </div>
                </div>
            )}

            {/* 1. HERO SECTION (Split Left/Right) */}
            <section className="relative px-6 pt-32 pb-20 max-w-7xl mx-auto w-full flex flex-col lg:flex-row items-center justify-between gap-16 lg:gap-8 overflow-visible">
                
                {/* Left Side: Text Content */}
                <div className="flex-1 w-full max-w-2xl flex flex-col items-start text-left shrink-0 z-10">
                    <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 bg-surface-2 rounded-full border border-border-default">
                        <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                        <span className="text-[12px] uppercase tracking-wide text-text-secondary font-bold">Sistema Contable Integral</span>
                    </div>
                    
                    <h1 className="text-[32px] sm:text-[56px] lg:text-[64px] font-bold leading-[1.1] sm:leading-[1.05] tracking-tight text-foreground mb-6">
                        Transparencia y Precisión <span className="text-primary-500 block sm:inline">Konta Suite</span>
                    </h1>
                    
                    <p className="text-[16px] sm:text-[18px] text-text-tertiary leading-relaxed mb-8 sm:mb-10 max-w-lg">
                        Konta Suite es una solución contable de nueva generación que unifica y acelera tú negocio en Venezuela. Nómina y cálculos en tiempo real.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-6 w-full sm:w-auto">
                        <BaseButton.Root as={Link} href="/sign-in" variant="primary" className="h-12 px-8 text-[14px] rounded-full shadow-lg shadow-primary-500/25 w-full sm:w-auto">
                            Comenzar Ahora
                        </BaseButton.Root>

                        <Link href="/herramientas/divisas" className="text-[14px] font-bold text-foreground hover:text-primary-500 underline underline-offset-4 decoration-primary-500/40 hover:decoration-primary-500 transition-colors whitespace-nowrap">
                            Herramientas públicas →
                        </Link>
                    </div>

                    <div className="mt-8 sm:mt-10">
                        <div className="flex items-center gap-3">
                            {/* Real Avatars */}
                            <div className="flex -space-x-3">
                                {[
                                    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80",
                                    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=100&q=80",
                                    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80"
                                ].map((url, i) => (
                                    <div key={i} className="w-10 h-10 rounded-full border-2 border-background overflow-hidden relative shadow-sm">
                                        <Image src={url} alt="Usuario" fill sizes="40px" className="object-cover" />
                                    </div>
                                ))}
                            </div>
                            <span className="text-[13px] text-text-secondary font-bold">
                                +1,200 Contadores
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right Side: Real Photographic Image */}
                <div className="flex-1 w-full max-w-lg lg:max-w-xl shrink-0 relative z-0">
                    {/* Circle Background */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-surface-2 via-background to-background rounded-full -z-10 blur-xl opacity-80" />
                    
                    <div className="relative aspect-square w-full rounded-[40px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] md:shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden border border-border-light group">
                        <Image 
                            src="https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80" 
                            alt="Sistema Contable Konta" 
                            fill
                            sizes="(min-width: 1024px) 40vw, 100vw"
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-primary-500/10 mix-blend-color pointer-events-none" />
                        
                        {/* Interactive UI highlight attached to image */}
                        <div className="absolute inset-x-4 sm:inset-x-8 bottom-4 sm:bottom-8 p-4 sm:p-6 bg-background/80 backdrop-blur-md rounded-2xl border border-border-light shadow-xl text-foreground">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                                <span className="font-bold text-[16px]">Cierre Contable Aprobado</span>
                            </div>
                            <div className="w-full bg-surface-2 h-2 rounded-full overflow-hidden mt-4">
                                <div className="bg-primary-500 w-[100%] h-full rounded-full" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. TARGET AUDIENCE RIBBON */}
            <section className="max-w-5xl mx-auto w-full px-6 py-8 pb-16 flex flex-col items-center justify-center text-center border-b border-border-light">
                <p className="text-[16px] text-text-tertiary font-medium mb-6 uppercase tracking-widest">
                    Herramientas de alto nivel diseñadas para
                </p>
                <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12 text-foreground font-bold text-[18px] md:text-[24px]">
                    <span>Emprendedores</span>
                    <span className="text-primary-500">•</span>
                    <span>Pequeñas Empresas</span>
                    <span className="text-primary-500">•</span>
                    <span>Pymes</span>
                    <span className="text-primary-500">•</span>
                    <span>Estudiantes</span>
                </div>
            </section>

            {/* 3. WHY KONTA? (Info split) */}
            <section className="max-w-7xl mx-auto px-6 py-16 md:py-28 w-full flex flex-col lg:flex-row items-center gap-12 md:gap-16 overflow-hidden">
                
                {/* Left: Real Image Photograph */}
                <div className="flex-1 w-full rounded-[32px] md:rounded-[40px] shadow-sm aspect-square md:aspect-[4/3] flex items-center justify-center relative overflow-hidden border border-border-light group">
                    <div className="absolute -top-10 -left-10 w-40 h-40 bg-primary-500/10 rounded-full blur-2xl z-10" />
                    
                    <Image 
                        src="https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=800&q=80" 
                        alt="Reunión Contable" 
                        fill
                        sizes="(min-width: 1024px) 50vw, 100vw"
                        className="object-cover absolute inset-0 transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-background/60 to-transparent pointer-events-none z-10" />
                </div>

                {/* Right: Text and Accordion features */}
                <div className="flex-1 w-full">
                    <span className="text-primary-500 font-bold text-[14px] uppercase tracking-wide inline-block text-center md:text-left w-full md:w-auto">¿Por Qué Nosotros?</span>
                    <h2 className="text-[28px] md:text-[44px] font-bold text-foreground leading-[1.1] md:leading-[1.1] mt-3 mb-8 md:mb-12 text-center md:text-left">La ventaja competitiva para tu negocio</h2>
                    
                    <div className="flex flex-col gap-10">
                        {/* Feature 1 */}
                        <div className="flex gap-6 items-start">
                            <div className="w-14 h-14 rounded-full bg-primary-500/10 text-primary-500 flex items-center justify-center shrink-0">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            </div>
                            <div>
                                <h3 className="text-[20px] font-bold text-foreground mb-2">Soporte centralizado y dedicado</h3>
                                <p className="text-[16px] text-text-tertiary leading-relaxed">Infraestructura blindada para proteger datos y un equipo siempre listo para resolver configuraciones organizacionales, evitando retrasos y múltiples intermediarios.</p>
                            </div>
                        </div>

                        {/* Feature 2 */}
                        <div className="flex gap-6 items-start">
                            <div className="w-14 h-14 rounded-full bg-primary-500/10 text-primary-500 flex items-center justify-center shrink-0">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                            </div>
                            <div>
                                <h3 className="text-[20px] font-bold text-foreground mb-2">Desarrollos adaptados a Venezuela</h3>
                                <p className="text-[16px] text-text-tertiary leading-relaxed">Integración directa y en vivo con las directrices BCV, automatizando la conversión a bolívares en cada operación crítica.</p>
                            </div>
                        </div>

                        {/* Feature 3 */}
                        <div className="flex gap-6 items-start">
                            <div className="w-14 h-14 rounded-full bg-primary-500/10 text-primary-500 flex items-center justify-center shrink-0">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                            </div>
                            <div>
                                <h3 className="text-[20px] font-bold text-foreground mb-2">Flexibilidad de uso</h3>
                                <p className="text-[16px] text-text-tertiary leading-relaxed">Puedes utilizar Konta según tu capacidad. Accede de inmediato a los módulos contables adaptables a cualquier dispositivo.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. END-TO-END MODULES GRID */}
            <section className="bg-surface-2 pt-24 pb-32 border-y border-border-light">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 md:mb-16">
                        <div className="max-w-2xl text-center md:text-left">
                            <span className="text-text-secondary font-bold text-[14px] uppercase tracking-wider">Flujo Comercial</span>
                            <h2 className="text-[28px] md:text-[44px] font-bold text-foreground leading-[1.1] mt-3">
                                Gestiona tu negocio de principio a fin
                            </h2>
                            <p className="text-[16px] text-text-tertiary leading-relaxed mt-4">Soluciones interconectadas que potencian el flujo de información corporativo dándote herramientas para el control absoluto.</p>
                        </div>
                        <BaseButton.Root as={Link} href="/sign-up" variant="primary" className="rounded-full h-12 px-8 font-bold text-[14px] w-full md:w-auto">
                            Ver Todos
                        </BaseButton.Root>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Module Card 1 */}
                        <div className="bg-background rounded-3xl border border-border-default overflow-hidden transition-all hover:shadow-2xl hover:shadow-foreground/5 hover:-translate-y-2 group">
                            <div className="h-56 bg-surface-1 border-b border-border-default flex items-center justify-center relative overflow-hidden group-hover:bg-surface-2 transition-colors">
                                <Image src="https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&w=600&q=80" alt="Nómina" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                                <div className="absolute inset-0 bg-background/20 group-hover:bg-transparent transition-colors duration-500" />
                            </div>
                            <div className="p-8">
                                <span className="text-primary-500 font-bold text-[11px] tracking-wider uppercase mb-2 block">Konta HR</span>
                                <h3 className="text-[22px] font-bold text-foreground mb-4">Programa Inteligente de Nómina</h3>
                                <p className="text-[15px] text-text-tertiary leading-relaxed">
                                    Automatiza el cálculo de utilidades, liquidaciones y recibos, blindando a tu empresa contra riesgos legales bajo las nuevas directrices.
                                </p>
                            </div>
                        </div>

                        {/* Module Card 2 */}
                        <div className="bg-background rounded-3xl border border-border-default overflow-hidden transition-all hover:shadow-2xl hover:shadow-foreground/5 hover:-translate-y-2 group">
                            <div className="h-56 bg-surface-1 border-b border-border-default flex items-center justify-center relative overflow-hidden group-hover:bg-surface-2 transition-colors">
                                <Image src="https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=600&q=80" alt="Inventario" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                                <div className="absolute inset-0 bg-background/20 group-hover:bg-transparent transition-colors duration-500" />
                            </div>
                            <div className="p-8">
                                <span className="text-primary-500 font-bold text-[11px] tracking-wider uppercase mb-2 block">Konta Inventories</span>
                                <h3 className="text-[22px] font-bold text-foreground mb-4">Módulo General de Inventarios</h3>
                                <p className="text-[15px] text-text-tertiary leading-relaxed">
                                    Control de existencia basado en lotes. Define el coste en USD con total visibilidad en las conversiones funcionales del momento.
                                </p>
                            </div>
                        </div>

                        {/* Module Card 3 */}
                        <div className="bg-background rounded-3xl border border-border-default overflow-hidden transition-all hover:shadow-2xl hover:shadow-foreground/5 hover:-translate-y-2 group">
                            <div className="h-56 bg-surface-1 border-b border-border-default flex items-center justify-center relative overflow-hidden group-hover:bg-surface-2 transition-colors">
                                <Image src="https://images.unsplash.com/photo-1606857521015-7f9fcf423740?auto=format&fit=crop&w=600&q=80" alt="Documentos" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                                <div className="absolute inset-0 bg-background/20 group-hover:bg-transparent transition-colors duration-500" />
                            </div>
                            <div className="p-8">
                                <span className="text-primary-500 font-bold text-[11px] tracking-wider uppercase mb-2 block">Konta Docs</span>
                                <h3 className="text-[22px] font-bold text-foreground mb-4">Archivo y Organización Global</h3>
                                <p className="text-[15px] text-text-tertiary leading-relaxed">
                                    Lleva toda tu organización en la nube. Visualiza instantáneamente los soportes contables, facturas y registros para mantener todo legal.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 5. EXPERIENCE & STATS */}
            <section className="max-w-7xl mx-auto px-6 py-28 w-full">
                
                {/* Top section: Text | Stats */}
                <div className="flex flex-col lg:flex-row justify-between mb-12 md:mb-20 gap-12 md:gap-16">
                    <div className="flex-1 max-w-lg mx-auto text-center lg:text-left flex flex-col items-center lg:items-start">
                        <span className="text-text-tertiary font-bold text-[11px] tracking-widest uppercase mb-3 block border border-border-medium px-3 py-1 rounded-full w-fit">Sobre Nosotros</span>
                        <h2 className="text-[28px] md:text-[36px] lg:text-[44px] font-bold text-foreground leading-[1.1] mb-6">Fuerte Experiencia, Soluciones Modernas</h2>
                        <p className="text-[16px] md:text-[18px] text-text-tertiary leading-relaxed">Combinamos años de conocimiento de los desafíos empresariales con desarrollo constante de vanguardia para impulsarte.</p>
                    </div>

                    <div className="flex-[1.5] w-full grid grid-cols-1 sm:grid-cols-3 gap-8 items-center border border-border-light rounded-[32px] p-8 sm:p-10 bg-surface-1/50 shadow-sm">
                        <div className="text-center sm:text-left">
                            <span className="text-[56px] font-black text-foreground block leading-none mb-3">25<span className="text-primary-500">+</span></span>
                            <span className="text-[13px] text-text-secondary font-bold uppercase tracking-wide">Reportes Fiscales</span>
                        </div>
                        <div className="text-center sm:text-left">
                            <span className="text-[56px] font-black text-foreground block leading-none mb-3">30<span className="text-primary-500">+</span></span>
                            <span className="text-[13px] text-text-secondary font-bold uppercase tracking-wide">Sectores Activos</span>
                        </div>
                        <div className="text-center sm:text-left">
                            <span className="text-[56px] font-black text-foreground block leading-none mb-3">2K<span className="text-primary-500">+</span></span>
                            <span className="text-[13px] text-text-secondary font-bold uppercase tracking-wide">Cuentas creadas</span>
                        </div>
                    </div>
                </div>

                {/* Bottom section: Split feature cards */}
                <div className="flex flex-col md:flex-row gap-8">
                    {/* Red Card */}
                    <div className="flex-[1.2] bg-primary-500 rounded-[32px] p-8 md:p-12 text-white relative overflow-hidden flex flex-col justify-end min-h-[350px] md:min-h-[450px] shadow-lg shadow-primary-500/10 group">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent pointer-events-none" />
                        
                        {/* Real Image Portrait Cutout Simulation */}
                        <div className="absolute -bottom-6 -right-6 w-64 h-64 rounded-full border-8 border-primary-500/30 shadow-2xl overflow-hidden hidden md:block group-hover:scale-105 transition-transform duration-500">
                            <Image src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80" alt="Profesional Ejecutiva" fill sizes="256px" className="object-cover" />
                        </div>

                        <div className="relative z-10 w-full md:w-full lg:w-2/3">
                            <div className="inline-flex bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full px-4 py-2 text-[12px] font-bold uppercase tracking-wide mb-6">Apto para ti</div>
                            <h3 className="text-[28px] md:text-[32px] font-bold leading-tight mb-4">Soluciones Contables Adecuadas Para Tus Procesos</h3>
                            <p className="text-primary-100 text-[15px] md:text-[16px] leading-relaxed">Controla todo desde un solo dispositivo. Transfórmate digitalmente agregando o limitando los módulos requeridos por empleado.</p>
                        </div>
                    </div>

                    {/* White/Surface Card */}
                    <div className="flex-1 bg-surface-1 rounded-[32px] border border-border-light p-8 md:p-12 relative overflow-hidden flex flex-col min-h-[350px] md:min-h-[450px]">
                        <h3 className="text-[28px] md:text-[32px] font-bold text-foreground leading-tight mb-4">Fácil Para Empezar</h3>
                        <p className="text-[15px] md:text-[16px] text-text-tertiary leading-relaxed mb-10 max-w-sm">Interfaces que mejoran con el tiempo facilitando los flujos del día a día en toda la empresa.</p>
                        
                        {/* Fake UI Checkboxes list */}
                        <div className="flex-1 flex flex-col gap-4 justify-end">
                            <div className="flex items-center gap-4 bg-background p-4 rounded-xl border border-border-default shadow-sm transform -rotate-1 translate-x-2">
                                <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shrink-0">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                                <span className="font-bold text-foreground text-[16px]">Automatización Activa</span>
                            </div>
                            <div className="flex items-center gap-4 bg-background p-4 rounded-xl border border-border-default shadow-sm transform rotate-1">
                                <div className="w-6 h-6 rounded-full border-2 border-border-medium bg-surface-2 shrink-0" />
                                <div className="flex flex-col gap-2 w-full">
                                    <span className="font-bold text-text-secondary text-[16px]">Cálculo Retrolactivo</span>
                                    <div className="w-1/2 h-2 bg-border-light rounded" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 6. PRICING GRID (Smart Integration of the Plans) */}
            <section className="bg-background pt-8 pb-32">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
                        <span className="text-text-tertiary font-bold text-[11px] tracking-widest uppercase mb-3 inline-block border border-border-medium px-3 py-1 rounded-full">Planes Modernos</span>
                        <h2 className="text-[28px] md:text-[44px] font-bold text-foreground leading-[1.1] mb-6">Negocios Que Descubren Su Poder Con Konta</h2>
                        <p className="text-[16px] md:text-[18px] text-text-tertiary leading-relaxed">Una cuenta para gestionar todo desde tu navegador preferido. Comienza con nuestro paquete base o expande las transacciones a nivel gerencial.</p>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col items-center justify-center gap-6 md:gap-8 mb-12 md:mb-16 w-full">
                        <div className="flex flex-col sm:flex-row items-center gap-2 p-1.5 bg-surface-1 rounded-3xl sm:rounded-full border border-border-light shadow-sm w-full sm:w-fit">
                            {(["monthly", "quarterly", "annual"] as Cycle[]).map((cKey) => {
                                const labels = { monthly: "Mensual", quarterly: "Trimestral", annual: "Anual" };
                                const isSel  = cycle === cKey;
                                return (
                                    <button 
                                        key={cKey} 
                                        onClick={() => setCycle(cKey)}
                                        className={`px-6 py-2.5 rounded-full text-[13px] font-bold uppercase tracking-wide transition-all flex-1 text-center w-full sm:w-auto ${isSel ? 'bg-primary-500 text-white shadow-md' : 'text-text-secondary hover:bg-surface-2 hover:text-foreground'}`}
                                    >
                                        {labels[cKey]}
                                        {avgSavings[cKey as keyof typeof avgSavings] && !isSel && (
                                            <span className="ml-2 bg-foreground/5 dark:bg-foreground/10 px-2 py-0.5 rounded-full">-{avgSavings[cKey as keyof typeof avgSavings]}%</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-border-default border border-border-default rounded-xl overflow-hidden shadow-sm flex-col sm:flex-row w-full sm:w-auto">
                            {BILLABLE_MODULES.map((tab) => (
                                <button
                                    key={tab.slug}
                                    onClick={() => changeTab(tab.slug)}
                                    className={`px-6 py-3 text-[14px] font-bold transition-all w-full sm:w-auto ${activeModule === tab.slug ? 'bg-surface-2 text-foreground shadow-inner' : 'bg-background text-text-tertiary hover:bg-surface-1 hover:text-text-secondary'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Pricing Grid Payload */}
                    <div
                        id={PANEL_ID}
                        className="transition-opacity duration-[200ms]"
                        style={{ opacity: tabTransitioning ? 0 : 1 }}
                    >
                        {plansLoading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="h-80 rounded-3xl bg-surface-2 border border-border-light animate-pulse" />
                                ))}
                            </div>
                        ) : plansError ? (
                            <div className="text-center py-20 text-red-500 font-bold">Error cargando planes. Intente de nuevo.</div>
                        ) : activeModuleIsFree ? (
                            <div className="flex justify-center">
                                <div className="bg-surface-1 rounded-3xl border border-border-light p-10 max-w-sm w-full text-center shadow-lg">
                                    <span className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary mb-2 block">Libre de Costo</span>
                                    <h3 className="text-[24px] font-bold mb-4">Plan Documentos</h3>
                                    <div className="text-[56px] font-black text-foreground mb-4">$0</div>
                                    <p className="text-[14px] text-text-secondary mb-8 font-medium">Sin costo hasta alcanzar los límites de uso por cuota (15GB).</p>
                                    <div className="flex flex-col gap-4 text-left border-t border-border-light pt-6 mb-8 mt-auto">
                                        {(FREE_MODULE_FEATURES[activeModule] ?? FREE_MODULE_FEATURES_FALLBACK).map(f => (
                                            <div key={f} className="flex gap-4 items-center">
                                                <div className="shrink-0 w-6 h-6 rounded-full bg-primary-500/10 text-primary-500 flex items-center justify-center">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                                </div>
                                                <span className="text-[14px] text-text-secondary font-medium">{f}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <BaseButton.Root as={Link} href="/sign-up" variant="outline" className="w-full rounded-full h-12">Comenzar Ahora</BaseButton.Root>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                {visiblePlans.map((plan, idx) => {
                                    const highlighted = idx === Math.floor(visiblePlans.length / 2);
                                    const price       = planPrice(plan);
                                    const savings     = planSavings(plan);

                                    return (
                                        <div key={plan.id} className={`bg-background rounded-3xl flex flex-col relative transition-all duration-300 border px-8 pb-8 pt-10 ${highlighted ? 'border-2 border-primary-500 shadow-xl shadow-primary-500/20 -translate-y-4 hover:-translate-y-6' : 'border border-border-default shadow-sm hover:border-border-medium hover:-translate-y-2 mt-4'}`}>
                                            {highlighted && (
                                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary-500 text-white px-6 py-1.5 rounded-full text-[12px] font-bold uppercase tracking-wider shadow-md whitespace-nowrap">
                                                    Recomendado
                                                </div>
                                            )}
                                            
                                            <h3 className="text-[22px] font-bold text-foreground mb-4">{plan.name}</h3>
                                            {plan.isContactOnly ? (
                                                <>
                                                    <div className="mb-2 flex items-end">
                                                        <span className="text-[36px] md:text-[40px] font-black leading-[0.85] text-foreground">Contactar</span>
                                                    </div>
                                                    <span className="text-[13px] font-medium text-text-tertiary mb-6 inline-block">Precio personalizado</span>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="mb-2 flex items-end">
                                                        <span className="text-[48px] font-black leading-[0.85]">${price}</span>
                                                        <span className="text-[14px] font-medium text-text-tertiary ml-2 bottom-1 relative">/ {cycle === "monthly" ? "mes" : cycle === "quarterly" ? "trim." : "año"}</span>
                                                    </div>
                                                    {savings ? (
                                                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold mb-6 w-fit">Ahorras {savings}</span>
                                                    ) : (
                                                        <div className="h-6 mb-6" /> // spacer
                                                    )}
                                                </>
                                            )}

                                            <div className="flex-1 flex flex-col gap-4 text-left border-t border-border-light pt-8 mb-8 mt-auto text-[14px] text-text-secondary font-medium">
                                                <div className="flex items-start gap-4">
                                                    <div className="shrink-0 mt-0.5"><svg width="18" height="18" className="text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                                                    {plan.maxCompanies === null ? "Empresas Ilimitadas" : `${plan.maxCompanies} Empresa${plan.maxCompanies>1?'s':''}`}
                                                </div>
                                                <div className="flex items-start gap-4">
                                                    <div className="shrink-0 mt-0.5"><svg width="18" height="18" className="text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                                                    {plan.maxEmployeesPerCompany === null ? "Usuarios Ilimitados" : `Hasta ${plan.maxEmployeesPerCompany} Usuarios`}
                                                </div>
                                                <div className="flex items-start gap-4">
                                                    <div className="shrink-0 mt-0.5"><svg width="18" height="18" className="text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                                                    Actualizaciones Inmediatas
                                                </div>
                                                <div className="flex items-start gap-4 opacity-60">
                                                    <div className="shrink-0 mt-0.5"><svg width="18" height="18" className="text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                                                    Soporte Regular
                                                </div>
                                            </div>

                                            <BaseButton.Root
                                                as={plan.isContactOnly ? "a" : Link}
                                                href={plan.isContactOnly ? "mailto:contacto@kont.app" : "/sign-up"}
                                                variant={highlighted ? "primary" : "outline"}
                                                className="w-full rounded-full h-12 font-bold text-[14px]"
                                            >
                                                {plan.isContactOnly ? "Contactar" : "Seleccionar"}
                                            </BaseButton.Root>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* 7. FREQUENTLY ASKED QUESTIONS */}
            <section className="bg-surface-2 pt-24 pb-32 border-y border-border-light">
                <div className="max-w-7xl mx-auto px-6 w-full flex flex-col lg:flex-row gap-16 items-center">
                    <div className="flex-1 w-full max-w-2xl text-center lg:text-left mx-auto">
                        <span className="text-text-tertiary font-bold text-[11px] tracking-widest uppercase mb-3 inline-block border border-border-medium px-3 py-1 rounded-full">FAQ</span>
                        <h2 className="text-[28px] md:text-[44px] font-bold text-foreground leading-[1.1] mb-8 md:mb-10">Preguntas Frecuentes</h2>

                        <div className="flex flex-col gap-4">
                            {[
                                { q: "¿Es fácil iniciar mi estructura salarial y contable?", a: "Totalmente. El sistema cuenta con configuraciones por defecto pre-establecidas por zona y sector que reducen horas de papeleo burocrático, además cuenta con asistente en vivo." },
                                { q: "¿Ofrecemos soporte local e instalaciones físicas?", a: "Nuestro producto opera 100% en la nube protegiendo los datos bajo cifrado AES256. No es necesario realizar mantenimientos de servidor físico." },
                                { q: "¿Cómo funcionan las equivalencias para la moneda contable?", a: "Se enlaza en directo con los índices BCV. Además, se guardan los históricos de transacciones con sus paridades funcionales del día del pago exacto de forma transparente." },
                                { q: "¿Qué sucede al superar mi cuota de usuarios o espacio?", a: "No nos enfocamos en limitar el avance, simplemente se te sugiere subir al próximo nivel tarifario desde tu facturación, o liberar cuentas inactivas de tu tenencia." }
                            ].map((faq, idx) => {
                                const isOpen = openFaq === idx;
                                return (
                                    <div key={idx} className={`border rounded-2xl overflow-hidden transition-all duration-300 ${isOpen ? 'bg-background border-primary-500/50 shadow-md' : 'bg-surface-1 border-border-light hover:border-border-medium'}`}>
                                        <button onClick={() => setOpenFaq(isOpen ? null : idx)} className="w-full flex justify-between items-center p-6 text-left focus-visible:outline-none">
                                            <span className={`font-bold text-[16px] pr-4 transition-colors ${isOpen ? 'text-primary-500' : 'text-foreground'}`}>{faq.q}</span>
                                            <div className="text-text-tertiary shrink-0">
                                                {isOpen ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                                       : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
                                            </div>
                                        </button>
                                        <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
                                            <div className="px-6 pb-6 text-[15px] text-text-tertiary leading-relaxed pt-2 border-t border-border-light/50 mx-6">
                                                {faq.a}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="flex-1 w-full max-w-xl h-[500px] relative group">
                         {/* Real Support Agent Photograph */}
                         <div className="w-full h-full rounded-[40px] border border-border-light relative overflow-hidden flex flex-col items-center justify-end shadow-lg">
                             <Image 
                                src="https://images.unsplash.com/photo-1590650516494-0c8e4a4dd67e?auto=format&fit=crop&w=600&q=80" 
                                alt="Soporte Konta" 
                                fill
                                sizes="(min-width: 1024px) 40vw, 100vw"
                                className="object-cover absolute inset-0 transition-transform duration-[1500ms] group-hover:scale-105"
                             />
                             <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent pointer-events-none" />
                             
                             {/* Floating chat bubbles */}
                             <div className="absolute bottom-12 left-8 right-8 flex flex-col gap-4">
                                 <div className="bg-background rounded-2xl rounded-bl-none px-6 py-4 shadow-xl self-start max-w-[85%] border border-border-light animate-pulse">
                                     <p className="text-[14px] text-foreground font-medium">¡Hola! ¿Cómo te puedo ayudar a integrar y organizar tu plan de cuentas?</p>
                                 </div>
                             </div>
                         </div>
                    </div>
                </div>
            </section>

            {/* 8. BOTTOM CTA BANNER */}
            <section className="bg-background pt-16 md:pt-32 pb-16 md:pb-32">
                <div className="max-w-7xl mx-auto px-6 w-full">
                    <div className="bg-primary-500 text-white rounded-[32px] md:rounded-[40px] px-6 py-16 md:py-32 flex flex-col items-center text-center relative overflow-hidden shadow-xl md:shadow-2xl">
                        {/* Glow and Shapes */}
                        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/10 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2" />
                        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-black/20 blur-[120px] rounded-full -translate-x-1/3 translate-y-1/2" />
                        
                        <span className="relative z-10 text-primary-200 font-bold tracking-widest uppercase text-[12px] mb-6 inline-block border border-primary-400 px-4 py-1.5 rounded-full bg-primary-600/30">
                            Centraliza Operaciones
                        </span>
                        
                        <h2 className="relative z-10 text-[32px] md:text-[56px] font-bold leading-[1.1] md:leading-[1.05] max-w-4xl mb-6 md:mb-8">
                            Gestiona Todos Tus Procesos Fácilmente y Aumenta Tu Eficiencia
                        </h2>
                        
                        <p className="relative z-10 text-[16px] md:text-[20px] text-white/80 max-w-2xl mb-10 md:mb-12 font-medium">
                            Automatiza tus finanzas y crece libremente. Toma las mejores decisiones basado en reportes a tiempo real.
                        </p>
                        
                        <div className="relative z-10 bg-white/10 p-2 rounded-full border border-white/20 backdrop-blur-sm">
                            <BaseButton.Root as={Link} href="/sign-up" className="rounded-full h-14 px-10 text-[16px] bg-white text-primary-500 hover:bg-neutral-100 font-bold transition-all shadow-lg hover:shadow-2xl hover:scale-105 active:scale-[0.98]">
                                Solicitar un Demo Gratis
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            </section>

        </div>
    );
}
