import type { NextConfig } from "next";
import withSerwist from "@serwist/next";

const withSerwistConfig = withSerwist({
    swSrc: "app/sw.ts",
    swDest: "public/sw.js",
    // Disable SW in development to avoid caching issues
    disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
    // Self-contained server for the Docker image (see Dockerfile).
    output: "standalone",
    // Pin the tracing root to this repository so server.js always lands at the
    // root of .next/standalone. Next otherwise infers it from the top-most
    // lockfile, which is a different directory inside a nested git worktree.
    outputFileTracingRoot: process.cwd(),
    // Serwist uses webpack — disable Turbopack for production builds
    turbopack: {},
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "images.unsplash.com",
            },
            {
                protocol: "https",
                hostname: "**.supabase.co",
            },
        ],
    },
    // Global security headers. vercel.json only applies on Vercel, so they are
    // declared here to hold on any host. Per-request CSP lives in middleware.ts.
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
                    { key: "X-Content-Type-Options",    value: "nosniff" },
                    { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
                    { key: "Permissions-Policy",        value: "geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()" },
                    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
                ],
            },
        ];
    },
    // Legacy inventory operation routes — collapsed into a single workspace at
    // /inventory/operations/new with a kind selector. Keep these redirects so
    // bookmarks and external links still land on the right preset.
    async redirects() {
        return [
            { source: "/inventory/adjustments",          destination: "/inventory/operations/new?op=adjustment",       permanent: true },
            { source: "/inventory/adjustments/new",      destination: "/inventory/operations/new?op=adjustment",       permanent: true },
            { source: "/inventory/returns",              destination: "/inventory/operations/new?op=return",           permanent: true },
            { source: "/inventory/returns/new",          destination: "/inventory/operations/new?op=return",           permanent: true },
            { source: "/inventory/self-consumption",     destination: "/inventory/operations/new?op=self-consumption", permanent: true },
            { source: "/inventory/self-consumption/new", destination: "/inventory/operations/new?op=self-consumption", permanent: true },
        ];
    },
};

export default withSerwistConfig(nextConfig);
