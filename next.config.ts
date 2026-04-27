import type { NextConfig } from "next";
import withSerwist from "@serwist/next";

const withSerwistConfig = withSerwist({
    swSrc: "app/sw.ts",
    swDest: "public/sw.js",
    // Disable SW in development to avoid caching issues
    disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
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
