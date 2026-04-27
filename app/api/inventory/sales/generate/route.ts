// API route — preview de salidas aleatorias por periodo.
// Devuelve líneas propuestas (no persiste) que el usuario puede regenerar
// (otro seed) o ajustar antes de confirmar via POST /api/inventory/sales.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import type { GenerateRandomSalesInput } from '@/src/modules/inventory/backend/app/generate-random-sales.use-case';

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const body = await req.json() as Partial<GenerateRandomSalesInput>;
    const {
        companyId,
        period,
        mode,
        target,
        count,
        seed,
        autoconsumoMode,
        autoconsumoTarget,
    } = body;

    if (!companyId)                    return Response.json({ error: 'companyId es requerido' },          { status: 400 });
    if (!period)                       return Response.json({ error: 'period es requerido (YYYY-MM)' },   { status: 400 });
    if (mode !== 'monto' && mode !== 'margen')
                                       return Response.json({ error: 'mode debe ser "monto" o "margen"' }, { status: 400 });
    if (typeof target !== 'number')    return Response.json({ error: 'target debe ser numérico' },        { status: 400 });

    const validAutoModes = ['none', 'porcentaje', 'monto'] as const;
    if (autoconsumoMode != null && !validAutoModes.includes(autoconsumoMode)) {
        return Response.json({ error: 'autoconsumoMode debe ser "none", "porcentaje" o "monto"' }, { status: 400 });
    }
    if (autoconsumoMode && autoconsumoMode !== 'none' && typeof autoconsumoTarget !== 'number') {
        return Response.json({ error: 'autoconsumoTarget debe ser numérico cuando autoconsumoMode no es "none"' }, { status: 400 });
    }

    const ownerId = actingAs?.ownerId ?? userId;
    const actions = getInventoryActions(ownerId);

    const result = await actions.generateRandomSales.execute({
        companyId, period, mode, target,
        count: typeof count === 'number' ? count : undefined,
        seed:  typeof seed  === 'number' ? seed  : undefined,
        autoconsumoMode:   autoconsumoMode ?? 'none',
        autoconsumoTarget: typeof autoconsumoTarget === 'number' ? autoconsumoTarget : undefined,
    });

    if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });
    return Response.json({ data: result.getValue() });
});
