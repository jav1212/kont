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
};

export default withSerwistConfig(nextConfig);
