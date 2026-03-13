import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ISource } from '../domain/repository/source.repository';

/** Cliente Supabase server-side con service role key (sin persistencia de sesión) */
export class ServerSupabaseSource implements ISource<SupabaseClient> {
    private _client: SupabaseClient | null = null;

    connect(): SupabaseClient {
        if (this._client) return this._client;
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error('Supabase environment variables are missing');
        this._client = createClient(url, key, { auth: { persistSession: false } });
        return this._client;
    }

    get instance(): SupabaseClient { return this.connect(); }
    async disconnect(): Promise<void> { this._client = null; }
}
