"use client";

import { useEffect, useState } from "react";
import {
    Monitor,
    Apple,
    Smartphone,
    Tablet,
    ChevronDown,
    Check,
    Download,
    Share,
    PlusSquare,
    MoreVertical,
    Sparkles,
    type LucideIcon,
} from "lucide-react";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { usePwaInstall } from "@/src/shared/frontend/hooks/use-pwa-install";
import {
    detectDevice,
    osLabel,
    browserLabel,
    type DeviceOS,
    type DeviceBrowser,
} from "@/src/shared/frontend/utils/detect-device";

// ─────────────────────────────────────────────────────────────────────────────
// Tutorial data
// ─────────────────────────────────────────────────────────────────────────────

type TutorialOS = "windows" | "macos" | "android" | "ios";

interface Step {
    icon: LucideIcon;
    text: string;
}

interface PlatformTutorial {
    os:       TutorialOS;
    title:    string;
    icon:     LucideIcon;
    browsers: string;
    steps:    Step[];
    note?:    string;
}

const TUTORIALS: ReadonlyArray<PlatformTutorial> = [
    {
        os:       "windows",
        title:    "Windows",
        icon:     Monitor,
        browsers: "Chrome o Edge",
        steps: [
            { icon: Monitor,     text: "Abrí kontave.com en Google Chrome o Microsoft Edge." },
            { icon: PlusSquare,  text: "En la barra de direcciones, hacé click en el ícono de instalación (un monitor con una flecha hacia abajo)." },
            { icon: Check,       text: "Confirmá «Instalar» en el diálogo del navegador." },
        ],
        note: "También podés ir al menú ⋮ → «Instalar Konta…» si no ves el ícono en la barra de direcciones.",
    },
    {
        os:       "macos",
        title:    "macOS",
        icon:     Apple,
        browsers: "Chrome, Edge o Safari 17+",
        steps: [
            { icon: Apple,       text: "Abrí kontave.com en Chrome, Edge o Safari (versión 17 o superior, macOS Sonoma)." },
            { icon: PlusSquare,  text: "En Chrome / Edge: ícono de instalación en la barra de direcciones. En Safari: menú Archivo → «Agregar al Dock»." },
            { icon: Check,       text: "Confirmá «Instalar» o «Agregar» según el navegador." },
        ],
        note: "Si usás Safari en macOS Ventura (13) o anterior, la instalación no está soportada — usá Chrome o Edge.",
    },
    {
        os:       "android",
        title:    "Android",
        icon:     Smartphone,
        browsers: "Chrome",
        steps: [
            { icon: Smartphone,  text: "Abrí kontave.com en Google Chrome." },
            { icon: MoreVertical, text: "Tocá el menú «⋮» en la esquina superior derecha del navegador." },
            { icon: PlusSquare,  text: "Tocá «Instalar app» o «Agregar a pantalla de inicio»." },
            { icon: Check,       text: "Confirmá «Instalar» — el ícono queda en tu pantalla de inicio." },
        ],
    },
    {
        os:       "ios",
        title:    "iOS / iPadOS",
        icon:     Tablet,
        browsers: "Safari (no funciona en Chrome/Firefox iOS)",
        steps: [
            { icon: Tablet,      text: "Abrí kontave.com en Safari. Importante: en iOS, sólo Safari puede instalar apps web — Chrome y Firefox no." },
            { icon: Share,       text: "Tocá el botón «Compartir» (ícono de cuadrado con flecha hacia arriba) en la barra inferior." },
            { icon: PlusSquare,  text: "Bajá y tocá «Agregar a pantalla de inicio»." },
            { icon: Check,       text: "Tocá «Agregar» en la esquina superior derecha." },
        ],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function tutorialOsFromDevice(os: DeviceOS): TutorialOS | null {
    if (os === "windows" || os === "macos" || os === "android" || os === "ios") return os;
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function InstalarAppPage() {
    const [device, setDevice] = useState<{ os: DeviceOS; browser: DeviceBrowser; isStandalone: boolean }>({
        os:           "unknown",
        browser:      "unknown",
        isStandalone: false,
    });
    const [mounted, setMounted] = useState(false);

    const { canPromptInstall, isInstalled, isStandalone, promptInstall } = usePwaInstall();

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator is browser-only
        setDevice(detectDevice());
        setMounted(true);
    }, []);

    const detectedOs    = mounted ? tutorialOsFromDevice(device.os) : null;
    const alreadyOnApp  = isStandalone || device.isStandalone || isInstalled;
    const showInstallCta = canPromptInstall && !alreadyOnApp;

    return (
        <div className="space-y-6 font-mono">
            {/* ── Callout principal ─────────────────────────────────────────── */}
            <SettingsSection
                title="Instalar Konta en este dispositivo"
                subtitle={
                    !mounted
                        ? "Detectando tu dispositivo…"
                        : alreadyOnApp
                            ? "Ya estás usando Konta como app instalada — no necesitás hacer nada más."
                            : detectedOs
                                ? `Detectado: ${osLabel(device.os)} · ${browserLabel(device.browser)}. Seguí los pasos abajo si necesitás instrucciones manuales.`
                                : "Tu dispositivo no se pudo identificar automáticamente. Buscá tu sistema operativo abajo."
                }
            >
                {alreadyOnApp ? (
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <Check className="h-4 w-4" strokeWidth={2.4} />
                        </div>
                        <div className="min-w-0">
                            <p className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                                App instalada
                            </p>
                            <p className="mt-1 font-sans text-[13px] leading-relaxed text-[var(--text-secondary)]">
                                Konta corre en modo standalone en este dispositivo. Si querés instalarla también en otro equipo, abrilo en su navegador y volvé a esta página.
                            </p>
                        </div>
                    </div>
                ) : showInstallCta ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary-500/20 bg-primary-500/10 text-primary-500">
                                <Sparkles className="h-4 w-4" strokeWidth={2.2} />
                            </div>
                            <p className="font-sans text-[13px] leading-relaxed text-[var(--text-secondary)]">
                                Tu navegador soporta instalación con un click. Confirmá el diálogo del sistema cuando aparezca.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => { void promptInstall(); }}
                            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary-500 px-4 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-white shadow-sm shadow-primary-500/20 transition-colors hover:bg-primary-600 active:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
                        >
                            <Download className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                            Instalar ahora
                        </button>
                    </div>
                ) : (
                    <div className="flex items-start gap-3 rounded-lg border border-border-light bg-surface-2/40 px-4 py-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-light bg-surface-1 text-[var(--text-tertiary)]">
                            <Download className="h-4 w-4" strokeWidth={2} />
                        </div>
                        <p className="font-sans text-[13px] leading-relaxed text-[var(--text-secondary)]">
                            Tu navegador no soporta instalación con un solo click. Seguí los pasos manuales para tu dispositivo abajo.
                        </p>
                    </div>
                )}
            </SettingsSection>

            {/* ── Tarjetas por plataforma ───────────────────────────────────── */}
            {TUTORIALS.map((tutorial) => (
                <PlatformCard
                    key={tutorial.os}
                    tutorial={tutorial}
                    highlighted={detectedOs === tutorial.os}
                    initiallyOpen={detectedOs === tutorial.os}
                />
            ))}

            {/* ── FAQ corta ─────────────────────────────────────────────────── */}
            <SettingsSection
                title="¿Por qué instalar la app?"
                subtitle="Konta funciona como una aplicación nativa después de instalarla."
            >
                <ul className="space-y-3">
                    {[
                        { title: "Acceso desde el escritorio o pantalla de inicio", body: "Abrís la app con un click sin pasar por el navegador." },
                        { title: "Modo offline básico",                              body: "Las páginas que ya visitaste, los recibos guardados y el kardex se siguen viendo aunque pierdas conexión." },
                        { title: "Actualizaciones automáticas",                      body: "Cada vez que publicamos una nueva versión, te avisamos con un banner para refrescar — no hay que reinstalar nada." },
                    ].map((item) => (
                        <li key={item.title} className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-primary-500/20 bg-primary-500/10 text-primary-500">
                                <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                            </div>
                            <div className="min-w-0">
                                <p className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                                    {item.title}
                                </p>
                                <p className="mt-0.5 font-sans text-[13px] leading-relaxed text-[var(--text-secondary)]">
                                    {item.body}
                                </p>
                            </div>
                        </li>
                    ))}
                </ul>
            </SettingsSection>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlatformCard — tarjeta colapsable por plataforma
// ─────────────────────────────────────────────────────────────────────────────

function PlatformCard({
    tutorial,
    highlighted,
    initiallyOpen,
}: {
    tutorial:      PlatformTutorial;
    highlighted:   boolean;
    initiallyOpen: boolean;
}) {
    const [open, setOpen] = useState(initiallyOpen);

    // Si initiallyOpen cambia tras la hidratación (cuando se detecta el OS),
    // sincronizar el estado abierto.
    useEffect(() => {
        setOpen(initiallyOpen);
    }, [initiallyOpen]);

    const Icon = tutorial.icon;

    const shellClass = highlighted
        ? "rounded-xl border border-primary-500/30 bg-primary-500/5 shadow-sm shadow-primary-500/10 overflow-hidden"
        : "rounded-xl border border-border-light bg-surface-1 shadow-sm shadow-black/[0.03] overflow-hidden";

    return (
        <section className={shellClass}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className={[
                    "flex w-full items-center justify-between gap-4 px-6 py-4 text-left",
                    "transition-colors duration-150 hover:bg-surface-2/40",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
                ].join(" ")}
            >
                <div className="flex min-w-0 items-center gap-3">
                    <div className={[
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                        highlighted
                            ? "border-primary-500/30 bg-primary-500/10 text-primary-500"
                            : "border-border-light bg-surface-2 text-[var(--text-tertiary)]",
                    ].join(" ")}>
                        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <h3 className="flex items-center gap-2 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                            {tutorial.title}
                            {highlighted && (
                                <span className="rounded-md border border-primary-500/30 bg-primary-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-primary-600">
                                    Tu dispositivo
                                </span>
                            )}
                        </h3>
                        <p className="mt-0.5 font-sans text-[12px] text-[var(--text-tertiary)]">
                            Navegador: {tutorial.browsers}
                        </p>
                    </div>
                </div>
                <ChevronDown
                    className={[
                        "h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform duration-200",
                        open ? "rotate-180" : "rotate-0",
                    ].join(" ")}
                    strokeWidth={2}
                    aria-hidden
                />
            </button>

            {open && (
                <div className={[
                    "border-t px-6 py-5",
                    highlighted ? "border-primary-500/20" : "border-border-light",
                ].join(" ")}>
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
                                        <p className="font-sans text-[13px] leading-relaxed text-[var(--text-secondary)]">
                                            {step.text}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                    {tutorial.note && (
                        <p className="mt-4 rounded-md border border-border-light bg-surface-2/40 px-3 py-2 font-sans text-[12px] leading-relaxed text-[var(--text-tertiary)]">
                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-foreground">Nota: </span>
                            {tutorial.note}
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
