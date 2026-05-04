"use client";

// usePwaInstall — hook compartido para el flujo de instalación PWA.
//
// Centraliza el listener de `beforeinstallprompt` (Chrome / Edge / Android),
// el evento `appinstalled` y el chequeo de modo standalone, para que tanto
// el botón del sidebar como la página de tutorial en /settings/instalar-app
// vean el mismo estado y no dupliquen lógica.
//
// El evento `beforeinstallprompt` se entrega a todos los listeners
// registrados, así que múltiples consumidores del hook conviven sin
// problema; cada uno guarda su propia referencia al evento diferido.

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaInstallState {
    /** Hay un evento `beforeinstallprompt` capturado y la app no está instalada todavía. */
    canPromptInstall: boolean;
    /** La app fue instalada en esta sesión (evento `appinstalled` o respuesta "accepted" del prompt). */
    isInstalled:      boolean;
    /** La página corre en modo standalone (PWA ya instalada y abierta como app). */
    isStandalone:     boolean;
    /** Dispara el prompt nativo. Resuelve con `"accepted"`/`"dismissed"`/`"unavailable"`. */
    promptInstall:    () => Promise<"accepted" | "dismissed" | "unavailable">;
}

function checkStandalone(): boolean {
    if (typeof window === "undefined") return false;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone) return true;
    return false;
}

export function usePwaInstall(): PwaInstallState {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled,    setInstalled]      = useState(false);
    const [isStandalone,   setIsStandalone]   = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        // eslint-disable-next-line react-hooks/set-state-in-effect -- window is browser-only
        setIsStandalone(checkStandalone());

        function handlePrompt(e: Event) {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        }

        function handleInstalled() {
            setInstalled(true);
            setDeferredPrompt(null);
        }

        window.addEventListener("beforeinstallprompt", handlePrompt);
        window.addEventListener("appinstalled", handleInstalled);

        return () => {
            window.removeEventListener("beforeinstallprompt", handlePrompt);
            window.removeEventListener("appinstalled", handleInstalled);
        };
    }, []);

    const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
        if (!deferredPrompt) return "unavailable";
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
            setInstalled(true);
            setDeferredPrompt(null);
        } else {
            // El navegador descarta el evento tras `prompt()`, no se puede reusar.
            setDeferredPrompt(null);
        }
        return outcome;
    }, [deferredPrompt]);

    return {
        canPromptInstall: !!deferredPrompt && !isInstalled,
        isInstalled,
        isStandalone,
        promptInstall,
    };
}
