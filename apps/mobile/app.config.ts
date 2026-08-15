import { resolve } from "node:path";
import { config as loadEnvironment } from "dotenv";
import type { ConfigContext, ExpoConfig } from "expo/config";

const repositoryRoot = resolve(process.cwd(), "../..");

// Mobile intentionally reuses the public connection variables already owned by
// the repository root. Service-role and other server-only secrets are never copied.
loadEnvironment({ path: resolve(repositoryRoot, ".env") });
loadEnvironment({ path: resolve(repositoryRoot, ".env.local"), override: true });

const mobileConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "Kontave",
  slug: config.slug ?? "kontave",
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    apiBaseUrl: process.env.EXPO_PUBLIC_KONTAVE_API_URL ?? process.env.KONTAVE_API_URL ?? "https://kontave.com",
  },
});

export default mobileConfig;
