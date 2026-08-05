// app/api/payroll/ari/route.ts
//
// API de declaraciones AR-I trimestrales (retención de ISLR) por empresa.
//   GET    ?companyId=...              → AriDeclaration[]
//   PUT    { companyId, declaration }  → upsert (recalcula % en el use-case)
//   DELETE { id }                      → elimina una declaración
//
// El aislamiento por tenant lo garantiza withTenant(); nunca se lee
// userId/ownerId del body. El payload se valida con Zod (REQ-008).

import { z }               from 'zod';
import { getAriActions }   from '@/src/modules/payroll/backend/infrastructure/ari-factory';
import { handleResult }    from '@/src/shared/backend/utils/handle-result';
import { withTenant }      from '@/src/shared/backend/utils/require-tenant';
import type { AriDeclaration } from '@/src/modules/payroll/backend/domain/ari-declaration';

// ── Zod ───────────────────────────────────────────────────────────────────────

const DeclarationSchema = z.object({
    id:                      z.string().optional(),
    employeeId:              z.string().min(1),
    employeeCedula:          z.string().min(1),
    anioGravable:            z.number().int().gte(2000).lte(2100),
    trimestreGravable:       z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    valorUT:                 z.number().nonnegative(),
    remuneracionTrimestral:  z.number().nonnegative(),
    usarDesgravamenUnico:    z.boolean(),
    desgEducacion:           z.number().nonnegative(),
    desgSeguros:             z.number().nonnegative(),
    desgMedicos:             z.number().nonnegative(),
    desgIntereses:           z.number().nonnegative(),
    cargasFamiliares:        z.number().int().nonnegative(),
    impuestosRetenidosDeMas: z.number().nonnegative(),
    // Recalculado en el servidor; se acepta pero no se confía.
    porcentajeRetencion:     z.number().optional(),
});

const PutBodySchema    = z.object({ companyId: z.string().min(1), declaration: DeclarationSchema });
const DeleteBodySchema = z.object({ id: z.string().min(1) });

// ── Handlers ──────────────────────────────────────────────────────────────────

export const GET = withTenant(async (req, { effectiveOwnerId, tenantId}) => {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    if (!companyId) {
        return Response.json({ error: 'companyId requerido' }, { status: 400 });
    }
    const result = await getAriActions(tenantId).getByCompany.execute(companyId);
    return handleResult(result);
});

export const PUT = withTenant(async (req, { effectiveOwnerId, tenantId}) => {
    let rawBody: unknown;
    try {
        rawBody = await req.json();
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }

    const parsed = PutBodySchema.safeParse(rawBody);
    if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? 'Payload inválido';
        return Response.json({ error: message }, { status: 400 });
    }

    const { companyId, declaration } = parsed.data;
    // companyId se toma del contenedor, no del sub-objeto: fuente única.
    const toSave: AriDeclaration = {
        ...declaration,
        companyId,
        porcentajeRetencion: declaration.porcentajeRetencion ?? 0,
    };
    const result = await getAriActions(tenantId).save.execute(toSave);
    return handleResult(result);
});

export const DELETE = withTenant(async (req, { effectiveOwnerId, tenantId}) => {
    let rawBody: unknown;
    try {
        rawBody = await req.json();
    } catch {
        return Response.json({ error: 'Formato JSON inválido' }, { status: 400 });
    }

    const parsed = DeleteBodySchema.safeParse(rawBody);
    if (!parsed.success) {
        return Response.json({ error: 'id requerido' }, { status: 400 });
    }

    const result = await getAriActions(tenantId).remove.execute(parsed.data.id);
    return handleResult(result);
});
