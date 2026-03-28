import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ISource } from '../domain/repository/source.repository';

/**
 * TenantSupabaseSource
 *
 * Supabase source scoped to a specific tenant schema.
 * `instance` returns a Postgrest client pointing to the tenant's private
 * schema (e.g. "tenant_550e8400e29b41d4a716446655440000"), allowing
 * repositories to call `.from('companies')` without modifying their logic.
 */
type SchemaClient = ReturnType<SupabaseClient['schema']>;

export class TenantSupabaseSource implements ISource<SchemaClient> {
    private _client: SupabaseClient | null = null;
    private readonly _schemaName: string;

    constructor(schemaName: string) {
        this._schemaName = schemaName;
    }

    connect(): SchemaClient {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY
                 ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !key) throw new Error('Supabase environment variables are missing');

        if (!this._client) {
            this._client = createClient(url, key, {
                auth: { persistSession: false },
            });
        }

        return this._client.schema(this._schemaName);
    }

    get instance(): SchemaClient {
        return this.connect();
    }

    async disconnect(): Promise<void> {
        this._client = null;
    }
}

/** Returns the Postgres schema name derived from the user UUID */
export function tenantSchemaName(userId: string): string {
    return 'tenant_' + userId.replace(/-/g, '');
}
