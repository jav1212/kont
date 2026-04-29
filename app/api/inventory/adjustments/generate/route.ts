// API route — preview de ajuste directo de existencia por periodo.
// Devuelve el delta propuesto por producto (no persiste) para que el usuario
// regenere parámetros o ajuste cantidades antes de confirmar via
// POST /api/inventory/adjustments.
import { getInventoryActions } from '@/src/modules/inventory/backend/infra/inventory-factory';
import { withTenant }          from '@/src/shared/backend/utils/require-tenant';
import type {
    GenerateStockAdjustmentInput,
    AdjustmentBaseSource,
    AdjustmentMode,
} from '@/src/modules/inventory/backend/app/generate-stock-adjustment.use-case';
import type { ProductType } from '@/src/modules/inventory/backend/domain/product';

const VALID_BASES: AdjustmentBaseSource[] = ['entradas', 'ventas'];
const VALID_MODES: AdjustmentMode[]       = ['porcentaje', 'monto'];
const VALID_TYPES: ProductType[]          = ['mercancia'];

export const POST = withTenant(async (req, { userId, actingAs }) => {
    const body = await req.json() as Partial<GenerateStockAdjustmentInput>;
    const {
        companyId,
        period,
        baseSource,
        mode,
        target,
        productTypes,
        departmentId,
        excludeZeroCost,
    } = body;

    if (!companyId)                          return Response.json({ error: 'companyId es requerido' },        { status: 400 });
    if (!period)                             return Response.json({ error: 'period es requerido (YYYY-MM)' }, { status: 400 });
    if (!baseSource || !VALID_BASES.includes(baseSource))
                                             return Response.json({ error: 'baseSource debe ser "entradas" o "ventas"' }, { status: 400 });
    if (!mode || !VALID_MODES.includes(mode))
                                             return Response.json({ error: 'mode debe ser "porcentaje" o "monto"' }, { status: 400 });
    if (typeof target !== 'number')          return Response.json({ error: 'target debe ser numérico' },      { status: 400 });

    if (productTypes != null) {
        if (!Array.isArray(productTypes) || productTypes.some((t) => !VALID_TYPES.includes(t as ProductType))) {
            return Response.json({ error: 'productTypes contiene valores inválidos' }, { status: 400 });
        }
    }

    const ownerId = actingAs?.ownerId ?? userId;
    const actions = getInventoryActions(ownerId);

    const result = await actions.generateStockAdjustment.execute({
        companyId,
        period,
        baseSource,
        mode,
        target,
        productTypes:    productTypes as ProductType[] | undefined,
        departmentId:    typeof departmentId === 'string' ? departmentId : undefined,
        excludeZeroCost: typeof excludeZeroCost === 'boolean' ? excludeZeroCost : undefined,
    });

    if (result.isFailure) return Response.json({ error: result.getError() }, { status: 400 });
    return Response.json({ data: result.getValue() });
});
