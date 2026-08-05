// API route for inventory period closures (cierres).
// Calls Postgres RPCs directly — no factory use case exists for this operation yet.
// PostgreSQL RPC parameter names (p_empresa_id, p_periodo, etc.) are kept as-is.
import { withTenant }           from '@/src/shared/backend/utils/require-tenant';
import { getInventoryClosuresRepository } from '@/src/modules/inventory/backend/infra/inventory-closures-factory';

export const GET = withTenant(async (req, { userId: _userId, actingAs: _actingAs, effectiveOwnerId, tenantId}) => {
    const companyId = new URL(req.url).searchParams.get('companyId');
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });

    const result = await getInventoryClosuresRepository(tenantId, effectiveOwnerId).list(companyId);
    return result.isFailure ? Response.json({ error: result.getError() }, { status: 400 }) : Response.json({ data: result.getValue() });
});

export const POST = withTenant(async (req, { userId: _userId, actingAs: _actingAs, effectiveOwnerId, tenantId}) => {
    const body = await req.json();
    const { companyId, period, notes, dollarRate } = body;
    if (!companyId) return Response.json({ error: 'companyId es requerido' }, { status: 400 });
    if (!period)    return Response.json({ error: 'period es requerido' },    { status: 400 });
    if (!/^\d{4}-\d{2}$/.test(period)) {
        return Response.json({ error: 'period debe tener formato YYYY-MM' }, { status: 400 });
    }

    const result = await getInventoryClosuresRepository(tenantId, effectiveOwnerId).save({ companyId, period, notes: notes ?? '', dollarRate: dollarRate ?? null });
    return result.isFailure ? Response.json({ error: result.getError() }, { status: 400 }) : Response.json({ data: result.getValue() });
});
