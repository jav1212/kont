"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Platform = "android" | "ios" | null;

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectPlatform(): Platform {
    if (typeof window === "undefined") return null;
    // Already installed — hide the button
    if (
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone)
    ) return null;

    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios";
    return "android";
}

// ── Shared instructions popover ───────────────────────────────────────────────

function Instructions({
    title,
    steps,
    onClose,
}: {
    title: string;
    steps: { icon: () => React.ReactNode; text: string }[];
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        }
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("mousedown", handleOutside);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleOutside);
            document.removeEventListener("keydown", handleKey);
        };
    }, [onClose]);

    return (
        <div
            ref={ref}
            role="dialog"
            aria-label={title}
            className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-xl border border-border-light bg-surface-1 p-4 space-y-3"
            style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
        >
            {/* Arrow */}
            <div className="absolute -bottom-[5px] left-6 w-2.5 h-2.5 rotate-45 bg-surface-1 border-r border-b border-border-light" />

            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground font-semibold">
                {title}
            </p>

            <ol className="space-y-2">
                {steps.map(({ icon: Icon, text }, i) => (
                    <li key={i} className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-primary-500/10 flex items-center justify-center flex-shrink-0 text-primary-500">
                            <Icon />
                        </div>
                        <span className="font-mono text-[11px] text-foreground/70 leading-tight">{text}</span>
                    </li>
                ))}
            </ol>

            <button
                onClick={onClose}
                className="w-full h-8 rounded-lg border border-border-light font-mono text-[10px] uppercase tracking-widest text-foreground/50 hover:text-foreground hover:border-border-medium transition-colors"
            >
                Cerrar
            </button>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PWAInstallButton({ navItemBase, navItemIdle }: {
    navItemBase: string;
    navItemIdle: string;
}) {
    const [platform, setPlatform]       = useState<Platform>(null);
    const [deferredPrompt, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [installed, setInstalled]     = useState(false);

    useEffect(() => {
        setPlatform(detectPlatform());

        function handlePrompt(e: Event) {
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
        }
        function handleInstalled() {
            setInstalled(true);
            setDeferred(null);
        }

        window.addEventListener("beforeinstallprompt", handlePrompt);
        window.addEventListener("appinstalled", handleInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", handlePrompt);
            window.removeEventListener("appinstalled", handleInstalled);
        };
    }, []);

    if (installed || platform === null) return null;

    async function handleClick() {
        if (deferredPrompt) {
            // Native Android prompt available — use it directly
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === "accepted") {
                setInstalled(true);
                setDeferred(null);
            }
        } else {
            // No native prompt (iOS, or Android without prompt yet) — show manual instructions
            setPopoverOpen((v) => !v);
        }
    }

    const iosSteps = [
        { icon: ShareIcon,     text: 'Toca el botón "Compartir"' },
        { icon: PlusSquareIcon, text: '"Agregar a pantalla de inicio"' },
        { icon: CheckIcon,     text: 'Toca "Agregar" para confirmar' },
    ];

    const androidSteps = [
        { icon: MenuIcon,      text: 'Toca el menú "⋮" del navegador' },
        { icon: PlusSquareIcon, text: '"Instalar aplicación" o "Agregar a pantalla de inicio"' },
        { icon: CheckIcon,     text: 'Toca "Instalar" para confirmar' },
    ];

    return (
        <div className="relative">
            {popoverOpen && (
                <Instructions
                    title={platform === "ios" ? "Instalar en iPhone / iPad" : "Instalar en Android"}
                    steps={platform === "ios" ? iosSteps : androidSteps}
                    onClose={() => setPopoverOpen(false)}
                />
            )}

            <button
                onClick={handleClick}
                aria-label="Obtener aplicación móvil"
                aria-expanded={popoverOpen}
                className={[navItemBase, navItemIdle].join(" ")}
            >
                <DownloadIcon />
                Obtener app móvil
            </button>
        </div>
    );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const DownloadIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6.5 1v7M4 6l2.5 2.5L9 6" />
        <path d="M2 10.5h9" />
    </svg>
);

const ShareIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 1v7M3.5 3.5L6 1l2.5 2.5" />
        <path d="M2 7v3.5h8V7" />
    </svg>
);

const PlusSquareIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="1" width="10" height="10" rx="1.5" />
        <path d="M6 4v4M4 6h4" />
    </svg>
);

const CheckIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 6.5l3 3 5-5" />
    </svg>
);

const MenuIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="6" cy="2.5" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="6" cy="6"   r="0.8" fill="currentColor" stroke="none" />
        <circle cx="6" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
);
