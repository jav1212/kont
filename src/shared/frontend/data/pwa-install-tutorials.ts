// pwa-install-tutorials — fuente única de verdad para los pasos de instalación
// PWA por sistema operativo. Consumido por:
//
//   • app/(app)/settings/instalar-app/page.tsx — versión completa (4 cards
//     colapsables con notas).
//   • app/(public)/_components/pwa-install-section.tsx — versión condensada
//     en el landing, sólo el OS detectado.

import {
    Apple,
    Check,
    Monitor,
    MoreVertical,
    PlusSquare,
    Share,
    Smartphone,
    Tablet,
    type LucideIcon,
} from "lucide-react";
import type { DeviceOS } from "@/src/shared/frontend/utils/detect-device";

export type TutorialOS = "windows" | "macos" | "android" | "ios";

export interface Step {
    icon: LucideIcon;
    text: string;
}

export interface PlatformTutorial {
    os:       TutorialOS;
    title:    string;
    icon:     LucideIcon;
    browsers: string;
    steps:    Step[];
    note?:    string;
}

export const TUTORIALS: ReadonlyArray<PlatformTutorial> = [
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
            { icon: Smartphone,   text: "Abrí kontave.com en Google Chrome." },
            { icon: MoreVertical, text: "Tocá el menú «⋮» en la esquina superior derecha del navegador." },
            { icon: PlusSquare,   text: "Tocá «Instalar app» o «Agregar a pantalla de inicio»." },
            { icon: Check,        text: "Confirmá «Instalar» — el ícono queda en tu pantalla de inicio." },
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

export function tutorialOsFromDevice(os: DeviceOS): TutorialOS | null {
    if (os === "windows" || os === "macos" || os === "android" || os === "ios") return os;
    return null;
}
