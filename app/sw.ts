import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst, CacheFirst, ExpirationPlugin } from "serwist";

// ── Global SW type augmentation ───────────────────────────────────────────────
declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    }
}

declare const self: ServiceWorkerGlobalScope;

// ── Cache names ───────────────────────────────────────────────────────────────
const STATIC_CACHE  = "kont-static-v1";
const IMAGES_CACHE  = "kont-images-v1";
const FONTS_CACHE   = "kont-fonts-v1";

// ── Serwist instance ──────────────────────────────────────────────────────────
const serwist = new Serwist({
    // Precache all Next.js static assets (JS, CSS, HTML shell)
    precacheEntries: self.__SW_MANIFEST,

    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,

    // Fallback page when navigation fails (no network, no cache)
    fallbacks: {
        entries: [
            {
                url:      "/offline",
                matcher:  ({ request }) => request.destination === "document",
            },
        ],
    },

    runtimeCaching: [
        // ── App shell (HTML navigation) — NetworkFirst ────────────────────
        // Try network, fallback to cache, then offline page
        {
            matcher:  ({ request }) => request.mode === "navigate",
            handler:  new NetworkFirst({
                cacheName:          STATIC_CACHE,
                networkTimeoutSeconds: 3,
                plugins: [
                    new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }),
                ],
            }),
        },

        // ── Images — CacheFirst (30 días) ────────────────────────────────
        {
            matcher:  ({ request }) => request.destination === "image",
            handler:  new CacheFirst({
                cacheName: IMAGES_CACHE,
                plugins: [
                    new ExpirationPlugin({
                        maxEntries:    64,
                        maxAgeSeconds: 30 * 24 * 60 * 60,
                    }),
                ],
            }),
        },

        // ── Web fonts — CacheFirst (1 año) ───────────────────────────────
        {
            matcher:  ({ url }) => url.origin === "https://fonts.googleapis.com" ||
                                   url.origin === "https://fonts.gstatic.com",
            handler:  new CacheFirst({
                cacheName: FONTS_CACHE,
                plugins: [
                    new ExpirationPlugin({
                        maxEntries:    16,
                        maxAgeSeconds: 365 * 24 * 60 * 60,
                    }),
                ],
            }),
        },

        // ── API routes — NO cachear (datos sensibles financieros) ─────────
        // /api/* se excluye explícitamente — siempre NetworkOnly (default)
    ],
});

serwist.addEventListeners();
