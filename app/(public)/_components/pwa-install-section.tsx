"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
    Download,
    Sparkles,
    Check,
    ArrowUpRight,
    Wifi,
    LayoutGrid,
    RefreshCw,
} from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { usePwaInstall } from "@/src/shared/frontend/hooks/use-pwa-install";
import {
    detectDevice,
    osLabel,
    type DeviceOS,
} from "@/src/shared/frontend/utils/detect-device";
import {
    TUTORIALS,
    tutorialOsFromDevice,
    type TutorialOS,
} from "@/src/shared/frontend/data/pwa-install-tutorials";

// ─────────────────────────────────────────────────────────────────────────────
// PwaInstallSection — bloque de marketing + instalación contextual del landing.
//
// Detecta el OS del visitante y muestra:
//   • copy + 3 beneficios (acceso, offline, updates)
//   • CTA primario: "Instalar ahora" si hay beforeinstallprompt, si no
//     "Ver instrucciones" que scrollea a los pasos.
//   • CTA secundario: "Tutorial completo" → /settings/instalar-app
//   • lista condensada de pasos del OS detectado (subset de TUTORIALS)
//   • mock visual device-specific en el lado derecho (iOS share sheet,
//     Android Chrome menu, desktop browser address bar)
//
// Se oculta cuando el usuario ya está en standalone o ya instaló la app —
// no tiene sentido marketear lo que ya hizo.
// ─────────────────────────────────────────────────────────────────────────────

const STEPS_ANCHOR_ID = "pwa-install-steps";

const BENEFITS = [
    {
        icon:  LayoutGrid,
        title: "Un click desde tu escritorio",
        body:  "Abrí Kontave sin pasar por el navegador. Atajo nativo en Windows, macOS, Android e iOS.",
    },
    {
        icon:  Wifi,
        title: "Modo offline básico",
        body:  "Recibos guardados, kardex y páginas que ya visitaste siguen disponibles si perdés conexión.",
    },
    {
        icon:  RefreshCw,
        title: "Updates automáticos",
        body:  "Cada nueva versión se avisa con un banner para refrescar — sin reinstalar nada.",
    },
];

export function PwaInstallSection() {
    const [device, setDevice] = useState<{ os: DeviceOS; isStandalone: boolean }>({
        os:           "unknown",
        isStandalone: false,
    });
    const [mounted, setMounted] = useState(false);
    const { canPromptInstall, isInstalled, isStandalone, promptInstall } = usePwaInstall();

    useEffect(() => {
        const d = detectDevice();
        // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator is browser-only
        setDevice({ os: d.os, isStandalone: d.isStandalone });
        setMounted(true);
    }, []);

    const detectedOs   = mounted ? tutorialOsFromDevice(device.os) : null;
    const alreadyOnApp = isStandalone || device.isStandalone || isInstalled;

    // Una vez hidratado y confirmado que la app ya corre como PWA, ocultar
    // toda la sección. Antes de hidratar (mounted === false) renderizamos
    // la versión genérica para evitar layout shift.
    if (mounted && alreadyOnApp) return null;

    const tutorial    = detectedOs ? TUTORIALS.find((t) => t.os === detectedOs) ?? null : null;
    const osLabelText = mounted ? osLabel(device.os) : "tu dispositivo";

    function handlePrimaryClick() {
        if (canPromptInstall) {
            void promptInstall();
            return;
        }
        // Fallback: scrollear a los pasos manuales que ya están renderizados
        // debajo. Evita abrir un modal — el flujo "marketing" del landing
        // privilegia mantener al visitante en la misma página.
        if (typeof document !== "undefined") {
            const el = document.getElementById(STEPS_ANCHOR_ID);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    const primaryLabel = canPromptInstall ? "Instalar ahora" : "Ver instrucciones";

    return (
        <section className="bg-background pt-24 pb-32 border-t border-border-light">
            <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

                {/* ── LEFT — copy + benefits + CTAs + steps ─────────────── */}
                <div className="flex flex-col">

                    {/* Eyebrow contextualizado al OS */}
                    <div className="inline-flex items-center gap-2.5 mb-6 h-7 px-3 rounded-full bg-surface-1 border border-border-default shadow-sm self-start">
                        <span className="relative flex w-2 h-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-primary-500/60 animate-ping" />
                            <span className="relative inline-flex rounded-full w-2 h-2 bg-primary-500" />
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-text-secondary">
                            {mounted && detectedOs
                                ? `Disponible en ${osLabelText}`
                                : "App instalable"}
                        </span>
                    </div>

                    {/* H2 */}
                    <h2 className="font-sans text-[32px] md:text-[44px] lg:text-[52px] font-black leading-[1.05] tracking-[-0.03em] text-foreground mb-5">
                        Llevá Kontave como{" "}
                        <span className="whitespace-nowrap">
                            <span className="text-primary-500">app nativa</span>
                            <span className="text-primary-500">.</span>
                        </span>
                    </h2>

                    {/* Sub */}
                    <p className="font-sans text-[16px] md:text-[18px] text-text-tertiary leading-relaxed mb-8 max-w-xl">
                        Sin pasar por la App Store ni Play Store. Una sola URL — kontave.com — se instala como app en{" "}
                        <span className="text-foreground font-semibold">cualquier dispositivo</span>{" "}
                        con un par de toques.
                    </p>

                    {/* Beneficios — 3 items mono */}
                    <ul className="flex flex-col gap-4 mb-9">
                        {BENEFITS.map((b) => {
                            const Icon = b.icon;
                            return (
                                <li key={b.title} className="flex items-start gap-3">
                                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary-500/20 bg-primary-500/10 text-primary-500">
                                        <Icon className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                                            {b.title}
                                        </p>
                                        <p className="mt-0.5 font-sans text-[14px] leading-relaxed text-text-tertiary">
                                            {b.body}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    {/* CTAs */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <BaseButton.Root
                            as="button"
                            type="button"
                            variant="primary"
                            onClick={handlePrimaryClick}
                            leftIcon={canPromptInstall ? <Sparkles className="w-4 h-4" strokeWidth={2.2} /> : <Download className="w-4 h-4" strokeWidth={2.2} />}
                            className="h-12 px-7 rounded-full font-mono text-[13px] uppercase tracking-[0.14em] font-bold shadow-md shadow-primary-500/30"
                        >
                            {primaryLabel}
                        </BaseButton.Root>
                        <Link
                            href="/settings/instalar-app"
                            className="inline-flex items-center justify-center gap-2 h-12 px-5 rounded-full border border-border-default bg-surface-1 font-mono text-[13px] uppercase tracking-[0.14em] font-bold text-foreground hover:bg-surface-2 transition-colors"
                        >
                            Tutorial completo
                            <ArrowUpRight className="w-4 h-4" strokeWidth={2.2} />
                        </Link>
                    </div>

                    {/* Pasos condensados del OS detectado */}
                    <div id={STEPS_ANCHOR_ID} className="mt-10 pt-8 border-t border-border-light scroll-mt-24">
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary font-semibold mb-5">
                            {tutorial
                                ? `Pasos para ${tutorial.title}`
                                : "Pasos rápidos"}
                        </p>

                        {tutorial ? (
                            <ol className="space-y-3">
                                {tutorial.steps.map((step, idx) => {
                                    const StepIcon = step.icon;
                                    return (
                                        <li key={idx} className="flex items-start gap-3">
                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary-500/20 bg-primary-500/10 text-primary-500">
                                                <StepIcon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                                            </div>
                                            <div className="flex min-w-0 items-baseline gap-2 pt-0.5">
                                                <span className="font-mono text-[11px] font-bold tabular-nums text-primary-500">
                                                    {String(idx + 1).padStart(2, "0")}
                                                </span>
                                                <p className="font-sans text-[14px] leading-relaxed text-text-secondary">
                                                    {step.text}
                                                </p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : (
                            <div className="flex items-start gap-3 rounded-lg border border-border-light bg-surface-2/40 px-4 py-3">
                                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-light bg-surface-1 text-text-tertiary">
                                    <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
                                </div>
                                <p className="font-sans text-[13px] leading-relaxed text-text-secondary">
                                    No detectamos tu dispositivo automáticamente. Abrí el{" "}
                                    <Link href="/settings/instalar-app" className="font-bold text-primary-500 hover:underline">
                                        tutorial completo
                                    </Link>{" "}
                                    para ver instrucciones de Windows, macOS, Android e iOS.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT — device-specific mock ──────────────────────── */}
                <div className="w-full flex items-center justify-center">
                    <DeviceMock os={detectedOs} />
                </div>
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// DeviceMock — frame visual por OS. Todo CSS/SVG, sin imágenes.
// ─────────────────────────────────────────────────────────────────────────────

function DeviceMock({ os }: { os: TutorialOS | null }) {
    return (
        <div className="relative w-full max-w-[420px] aspect-[4/4.4] flex items-center justify-center">
            {/* Ambient orange glow detrás del frame */}
            <div aria-hidden className="absolute inset-[10%] bg-primary-500/15 blur-3xl rounded-full pointer-events-none" />

            {os === "ios" || os === "android" ? (
                <PhoneFrame os={os} />
            ) : (
                <DesktopFrame />
            )}
        </div>
    );
}

// ── Phone frame común para iOS/Android ──────────────────────────────────────

function PhoneFrame({ os }: { os: "ios" | "android" }) {
    const isIos = os === "ios";

    return (
        <div className="relative z-10 w-[260px] sm:w-[280px] aspect-[9/19] rounded-[36px] bg-surface-1 border border-border-default shadow-[0_30px_60px_-20px_rgba(8,9,16,0.35)] overflow-hidden flex flex-col">

            {/* Status bar */}
            <div className="relative h-7 bg-surface-2 border-b border-border-light flex items-center justify-between px-5">
                {isIos && (
                    <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-20 h-4 rounded-full bg-foreground/90" />
                )}
                <span className="font-mono text-[9px] tabular-nums text-text-tertiary font-semibold">
                    9:41
                </span>
                <div className="flex items-center gap-1">
                    <div className="w-2.5 h-1.5 rounded-[1px] bg-text-tertiary/60" />
                    <div className="w-3 h-1.5 rounded-[1px] bg-text-tertiary/80" />
                    <div className="w-3 h-1.5 rounded-[2px] border border-text-tertiary/60 relative">
                        <div className="absolute inset-0.5 bg-text-tertiary/80 rounded-[1px]" />
                    </div>
                </div>
            </div>

            {/* URL bar */}
            <div className="px-3 py-2 border-b border-border-light bg-background flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-tertiary font-semibold">
                    {isIos ? "Aa" : "🔒"}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-text-secondary truncate flex-1">
                    kontave.com
                </span>
                {!isIos && (
                    <span className="font-mono text-[14px] leading-none text-text-tertiary font-bold">
                        ⋮
                    </span>
                )}
            </div>

            {/* App preview area */}
            <div className="flex-1 px-4 py-5 flex flex-col items-center justify-center gap-3 relative">
                {/* App icon */}
                <div className="w-16 h-16 rounded-2xl bg-foreground flex items-center justify-center shadow-md relative">
                    <span className="font-sans text-[28px] font-black leading-none text-primary-500">
                        K
                        <span className="text-primary-500">.</span>
                    </span>
                </div>
                <p className="font-sans text-[13px] font-bold text-foreground leading-tight">
                    Kontave
                </p>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-tertiary font-semibold">
                    Software contable · VE
                </p>
            </div>

            {/* Bottom — share sheet (iOS) o menu (Android) */}
            {isIos ? <IosShareSheet /> : <AndroidMenu />}
        </div>
    );
}

// ── iOS share sheet emergente ──────────────────────────────────────────────

function IosShareSheet() {
    return (
        <div className="border-t border-border-default bg-surface-2 px-3 pt-3 pb-4 flex flex-col gap-2">
            <div className="self-center w-9 h-1 rounded-full bg-border-medium mb-1" />
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-tertiary font-semibold px-1">
                Compartir
            </p>

            {/* Fila destacada: Agregar a pantalla de inicio */}
            <div className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg border border-primary-500/40 bg-primary-500/10">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-surface-1 border border-primary-500/30 flex items-center justify-center text-primary-500 font-black text-[15px] leading-none">
                        +
                    </div>
                    <span className="font-mono text-[10px] font-bold text-foreground truncate">
                        Agregar a pantalla de inicio
                    </span>
                </div>
                <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
            </div>

            {/* Fila secundaria muteada */}
            <div className="flex items-center gap-2.5 px-2.5 py-1.5 opacity-50">
                <div className="w-6 h-6 rounded-md bg-surface-1 border border-border-light" />
                <span className="font-mono text-[10px] text-text-tertiary truncate">
                    Copiar enlace
                </span>
            </div>
        </div>
    );
}

// ── Android Chrome menu ⋮ emergente ────────────────────────────────────────

function AndroidMenu() {
    return (
        <div className="border-t border-border-default bg-surface-2 px-3 py-3 flex flex-col gap-1.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-tertiary font-semibold px-1 mb-1">
                Menú · ⋮
            </p>

            <div className="flex items-center gap-2.5 px-2.5 py-1.5 opacity-50">
                <div className="w-5 h-5 rounded bg-surface-1 border border-border-light" />
                <span className="font-mono text-[10px] text-text-tertiary truncate">
                    Nueva pestaña
                </span>
            </div>

            {/* Fila destacada: Instalar app */}
            <div className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg border border-primary-500/40 bg-primary-500/10">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-5 h-5 rounded bg-surface-1 border border-primary-500/30 flex items-center justify-center text-primary-500 font-black text-[12px] leading-none">
                        ↓
                    </div>
                    <span className="font-mono text-[10px] font-bold text-foreground truncate">
                        Instalar app
                    </span>
                </div>
                <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
            </div>

            <div className="flex items-center gap-2.5 px-2.5 py-1.5 opacity-50">
                <div className="w-5 h-5 rounded bg-surface-1 border border-border-light" />
                <span className="font-mono text-[10px] text-text-tertiary truncate">
                    Configuración
                </span>
            </div>
        </div>
    );
}

// ── Desktop browser frame (Windows/macOS o fallback) ───────────────────────

function DesktopFrame() {
    return (
        <div className="relative z-10 w-full max-w-[420px] aspect-[4/3] rounded-2xl bg-surface-1 border border-border-default shadow-[0_30px_60px_-20px_rgba(8,9,16,0.35)] overflow-hidden flex flex-col">

            {/* Window chrome */}
            <div className="h-9 bg-surface-2 border-b border-border-light flex items-center px-4 gap-2">
                <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
                </div>
                <div className="flex-1" />
            </div>

            {/* Address bar con install icon highlighted */}
            <div className="px-4 py-3 border-b border-border-light bg-background flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-text-tertiary">
                    <span className="font-mono text-[12px] leading-none">←</span>
                    <span className="font-mono text-[12px] leading-none">→</span>
                    <span className="font-mono text-[12px] leading-none">↻</span>
                </div>
                <div className="flex-1 flex items-center gap-2 h-7 px-3 rounded-full bg-surface-2 border border-border-light">
                    <span className="font-mono text-[10px] text-text-tertiary leading-none">🔒</span>
                    <span className="font-mono text-[11px] tabular-nums text-foreground truncate">
                        kontave.com
                    </span>
                    <div className="flex-1" />
                    {/* Install icon highlighted con tooltip */}
                    <div className="relative">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border border-primary-500/40 bg-primary-500/15 text-primary-500 font-black text-[11px] leading-none">
                            ↓
                        </span>
                        <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-primary-500" />
                    </div>
                </div>
            </div>

            {/* App preview placeholder */}
            <div className="flex-1 px-6 py-6 flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-foreground flex items-center justify-center shadow-md shrink-0">
                    <span className="font-sans text-[28px] font-black leading-none text-primary-500">
                        K
                        <span className="text-primary-500">.</span>
                    </span>
                </div>
                <div className="min-w-0 flex flex-col">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary font-semibold mb-1">
                        Instalar Kontave
                    </p>
                    <p className="font-sans text-[14px] font-bold text-foreground leading-tight">
                        Software contable · Venezuela
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                        <span className="inline-flex items-center justify-center h-7 px-3 rounded-md bg-primary-500 text-white font-mono text-[10px] uppercase tracking-[0.14em] font-bold">
                            Instalar
                        </span>
                        <span className="inline-flex items-center justify-center h-7 px-3 rounded-md border border-border-default bg-surface-1 text-text-secondary font-mono text-[10px] uppercase tracking-[0.14em] font-bold">
                            Cancelar
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
