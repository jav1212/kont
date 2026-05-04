"use client";

// useServiceWorkerUpdate — detecta cuando hay un nuevo Service Worker en
// estado `waiting` y expone una acción para activarlo + recargar la página.
//
// Patrón estándar Workbox/Serwist: con skipWaiting=false en el SW, cada
// deploy nuevo queda esperando hasta que el cliente le manda SKIP_WAITING.
// Aquí orquestamos esa espera, el polling de `registration.update()` y el
// reload tras `controllerchange`.

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 min

export interface ServiceWorkerUpdateState {
    /** Hay un SW nuevo instalado y esperando que la usuaria confirme el reload. */
    updateAvailable: boolean;
    /** Activa el SW waiting y recarga la página. No-op si no hay update. */
    applyUpdate: () => void;
}

export function useServiceWorkerUpdate(): ServiceWorkerUpdateState {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        let cancelled = false;
        let pollHandle: ReturnType<typeof setInterval> | null = null;
        const removers: Array<() => void> = [];

        function watchInstalling(reg: ServiceWorkerRegistration) {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                    setUpdateAvailable(true);
                }
            });
        }

        navigator.serviceWorker.ready.then((reg) => {
            if (cancelled) return;
            registrationRef.current = reg;

            // Caso 1: ya había un SW waiting al montar
            if (reg.waiting && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
            }

            // Caso 2: hay un SW instalándose ahora mismo
            watchInstalling(reg);

            // Caso 3: futuros updates detectados durante la sesión
            const onUpdateFound = () => watchInstalling(reg);
            reg.addEventListener("updatefound", onUpdateFound);
            removers.push(() => reg.removeEventListener("updatefound", onUpdateFound));

            const pollUpdate = () => {
                reg.update().catch(() => { /* offline o error transitorio — silencioso */ });
            };

            pollHandle = setInterval(pollUpdate, POLL_INTERVAL_MS);

            const onVisibility = () => {
                if (document.visibilityState === "visible") pollUpdate();
            };
            const onOnline = () => pollUpdate();

            document.addEventListener("visibilitychange", onVisibility);
            window.addEventListener("online", onOnline);
            removers.push(() => {
                document.removeEventListener("visibilitychange", onVisibility);
                window.removeEventListener("online", onOnline);
            });
        }).catch(() => { /* SW no soportado o blocked */ });

        return () => {
            cancelled = true;
            if (pollHandle) clearInterval(pollHandle);
            for (const fn of removers) fn();
        };
    }, []);

    const applyUpdate = useCallback(() => {
        const reg = registrationRef.current;
        if (!reg?.waiting) return;

        const onControllerChange = () => {
            navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
            window.location.reload();
        };
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

        reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }, []);

    return { updateAvailable, applyUpdate };
}
