import type { NextConfig } from "next";

// This isolated consumer checks App Router compatibility without migrating Web.
const config: NextConfig = {
  distDir: "out/next",
  transpilePackages: ["@kontave/ui"],
};

export default config;
