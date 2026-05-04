// detectDevice — UA-based detection for UI personalization.
// Para uso visual (resaltar la sección correcta en el tutorial PWA), no para
// gating de seguridad ni decisiones de routing — los user agents se pueden
// falsificar y el navegador iPadOS reporta UA de macOS.

export type DeviceOS      = "windows" | "macos" | "android" | "ios" | "linux" | "unknown";
export type DeviceBrowser = "chrome"  | "edge"  | "safari"  | "firefox" | "unknown";

export interface DetectedDevice {
    os:           DeviceOS;
    browser:      DeviceBrowser;
    isStandalone: boolean;
}

const SSR_DEFAULT: DetectedDevice = {
    os:           "unknown",
    browser:      "unknown",
    isStandalone: false,
};

export function detectDevice(): DetectedDevice {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
        return SSR_DEFAULT;
    }

    const ua = navigator.userAgent;

    // ── OS ────────────────────────────────────────────────────────────────────
    let os: DeviceOS = "unknown";
    if (/iPhone|iPod/i.test(ua)) {
        os = "ios";
    } else if (/iPad/i.test(ua)) {
        os = "ios";
    } else if (/Android/i.test(ua)) {
        os = "android";
    } else if (/Win(dows|32|64|NT)/i.test(ua)) {
        os = "windows";
    } else if (/Mac OS X|Macintosh/i.test(ua)) {
        // iPadOS 13+ reporta UA de Mac; lo distinguimos por touch points.
        const isIpad = navigator.maxTouchPoints > 1;
        os = isIpad ? "ios" : "macos";
    } else if (/Linux/i.test(ua)) {
        os = "linux";
    }

    // ── Browser ───────────────────────────────────────────────────────────────
    // Edge contiene "Chrome" en su UA, así que va primero. Chrome iOS usa
    // "CriOS"; Firefox iOS usa "FxiOS".
    let browser: DeviceBrowser = "unknown";
    if (/Edg\//.test(ua)) {
        browser = "edge";
    } else if (/CriOS|Chrome\//.test(ua)) {
        browser = "chrome";
    } else if (/FxiOS|Firefox\//.test(ua)) {
        browser = "firefox";
    } else if (/Safari\//.test(ua)) {
        browser = "safari";
    }

    // ── Standalone ────────────────────────────────────────────────────────────
    const isStandalone =
        window.matchMedia?.("(display-mode: standalone)").matches === true ||
        ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);

    return { os, browser, isStandalone };
}

export function osLabel(os: DeviceOS): string {
    switch (os) {
        case "windows": return "Windows";
        case "macos":   return "macOS";
        case "android": return "Android";
        case "ios":     return "iOS";
        case "linux":   return "Linux";
        default:        return "Desconocido";
    }
}

export function browserLabel(browser: DeviceBrowser): string {
    switch (browser) {
        case "chrome":  return "Chrome";
        case "edge":    return "Edge";
        case "safari":  return "Safari";
        case "firefox": return "Firefox";
        default:        return "Navegador";
    }
}
