// src/frontend/lib/supabase-browser.ts
//
// Cliente de Supabase para el frontend (browser).
// Usa createBrowserClient de @supabase/ssr que sincroniza la sesión
// automáticamente con las cookies del browser.
//
// Es un singleton — se crea una sola vez y se reutiliza en toda la app.
// El useAuth hook lo usa directamente en vez de llamar a /api/auth/me.

import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
    if (_client) return _client;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        throw new Error("Supabase environment variables are missing");
    }

    _client = createBrowserClient(url, key);
    return _client;
}