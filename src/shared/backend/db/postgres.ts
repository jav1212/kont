import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';

type SqlClient = postgres.Sql;
type TransactionClient = postgres.TransactionSql;

type TenantScope = {
    db: TransactionClient;
    tenantId: string;
};

const tenantScope = new AsyncLocalStorage<TenantScope>();

let runtimeClient: SqlClient | null = null;
let adminClient: SqlClient | null = null;

function connectionUrl(name: 'runtime' | 'admin'): string {
    const value = name === 'admin'
        ? process.env.SUPABASE_ADMIN_DB_URL ?? process.env.SUPABASE_DB_URL
        : process.env.SUPABASE_DB_URL;

    if (!value) {
        throw new Error(
            name === 'admin'
                ? 'SUPABASE_ADMIN_DB_URL o SUPABASE_DB_URL no está configurada'
                : 'SUPABASE_DB_URL no está configurada',
        );
    }

    return value;
}

function createClient(name: 'runtime' | 'admin'): SqlClient {
    return postgres(connectionUrl(name), {
        // Supabase Transaction Pooler requires prepare:false.
        prepare: false,
        max: Number(process.env.SUPABASE_DB_POOL_SIZE ?? 10),
        idle_timeout: 20,
        connect_timeout: 10,
        onnotice: () => {},
    });
}

/** Returns the tenant transaction when called inside withTenant(). */
export function getDb(): SqlClient | TransactionClient {
    return tenantScope.getStore()?.db ?? getRuntimeDb();
}

/** Returns the least-privilege runtime pooler client. */
export function getRuntimeDb(): SqlClient {
    runtimeClient ??= createClient('runtime');
    return runtimeClient;
}

/** Returns the privileged client reserved for migrations and bootstrap. */
export function getAdminDb(): SqlClient {
    adminClient ??= createClient('admin');
    return adminClient;
}

/**
 * Runs an operation in one transaction with an explicit tenant context.
 * RLS policies can use current_setting('app.current_tenant_id', true).
 */
export async function withTenant<T>(
    tenantId: string,
    operation: () => Promise<T>,
): Promise<T> {
    if (!tenantId.trim()) {
        throw new Error('tenantId es obligatorio');
    }

    return getRuntimeDb().begin(async (tx) => {
        await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
        return tenantScope.run({ db: tx, tenantId }, operation);
    }) as Promise<T>;
}

export function currentTenantId(): string | undefined {
    return tenantScope.getStore()?.tenantId;
}

export async function closePostgresClients(): Promise<void> {
    await Promise.all([
        runtimeClient?.end({ timeout: 5 }),
        adminClient?.end({ timeout: 5 }),
    ]);
    runtimeClient = null;
    adminClient = null;
}
