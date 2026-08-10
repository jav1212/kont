import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ISource } from '../domain/repository/source.repository';

const nativeFetch = globalThis.fetch.bind(globalThis);

/**
 * Supabase reads can fail transiently in the local Next.js server runtime.
 * Retry only idempotent reads; writes/RPCs must never be repeated implicitly.
 */
const resilientFetch: typeof fetch = async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const attempts = method === 'GET' || method === 'HEAD' ? 3 : 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await nativeFetch(input, init);
        } catch (error) {
            lastError = error;
            if (attempt + 1 < attempts) {
                await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
            }
        }
    }

    throw lastError;
};

/** Server-side Supabase client with service role key (no session persistence) */
export class ServerSupabaseSource implements ISource<SupabaseClient> {
    private _client: SupabaseClient | null = null;

    connect(): SupabaseClient {
        if (this._client) return this._client;
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error('Supabase environment variables are missing');
        this._client = createClient(url, key, {
            auth: { persistSession: false },
            global: { fetch: resilientFetch },
        });
        return this._client;
    }

    get instance(): SupabaseClient { return this.connect(); }
    async disconnect(): Promise<void> { this._client = null; }
}
