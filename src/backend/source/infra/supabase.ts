// src/backend/source/infra/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ISource } from '../domain/repository/source.repository';
import { Source } from '../domain/source.abstract';

export class SupabaseSource extends Source<SupabaseClient> implements ISource<SupabaseClient> {

    constructor() {
        super();
        // Inicializamos la conexión al instanciar la clase
        this.connect();
    }

    /**
     * Getter requerido por la interfaz ISource que utiliza tu repositorio
     */
    get instance(): SupabaseClient {
        if (!this._instance) {
            return this.connect();
        }
        return this._instance;
    }

    /**
     * Crea la instancia de Supabase usando las variables de entorno
     */
    connect(): SupabaseClient {
        if (!this._instance) {
            // Validamos que las variables existan para evitar errores silenciosos
            const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

            if (!url || !key) {
                throw new Error("Supabase environment variables are missing");
            }

            this._instance = createClient(url, key, {
                auth: {
                    flowType: 'pkce', // Forzar el uso de PKCE
                    persistSession: true,
                    detectSessionInUrl: true
                }
            });
        }
        return this._instance;
    }

    async disconnect(): Promise<void> {
        this._instance = null;
    }
}