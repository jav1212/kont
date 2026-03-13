import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ISource } from '../domain/repository/source.repository';

/**
 * TenantSupabaseSource
 *
 * Source para queries de datos de un tenant específico.
 * `instance` devuelve un cliente Postgrest apuntando al schema privado
 * del tenant (e.g. "tenant_550e8400e29b41d4a716446655440000"),
 * lo que permite que los repositorios usen `.from('companies')` etc.
 * sin modificar su lógica interna.
 */
export class TenantSupabaseSource implements ISource<any> {
    private _client: SupabaseClient | null = null;
    private readonly _schemaName: string;

    constructor(schemaName: string) {
        this._schemaName = schemaName;
    }

    connect(): any {
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

    get instance(): any {
        return this.connect();
    }

    async disconnect(): Promise<void> {
        this._client = null;
    }
}

/** Calcula el nombre de schema a partir del UUID del usuario */
export function tenantSchemaName(userId: string): string {
    return 'tenant_' + userId.replace(/-/g, '');
}
