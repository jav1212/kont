// rpc-movement-draft.repository.ts — Supabase RPC adapter for MovementDraft.
// Role: infrastructure — implements IMovementDraftRepository via Postgres RPC.
// Invariant: all DB RPC function names are unchanged (DB contract).
import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IMovementDraftRepository } from '../../domain/repository/movement-draft.repository';
import type {
    MovementDraftConfirmResult,
    MovementDraftDirection,
    MovementDraftGroup,
    MovementDraftIvaMode,
    MovementDraftKind,
    MovementDraftRow,
    MovementDraftSaveInput,
    MovementDraftSaveResult,
    MovementDraftSummary,
} from '../../domain/movement-draft';
import type { MovementAdjustmentKind, MovementType } from '../../domain/movement';

const num = (v: number | string | null | undefined, fallback = 0): number =>
    v == null || v === '' ? fallback : Number(v);

const adjKind = (v: string | null | undefined): MovementAdjustmentKind | null =>
    v === 'monto' || v === 'porcentaje' ? v : null;

function toRpcRow(r: MovementDraftRow): Record<string, unknown> {
    return {
        id:                  r.id ?? '',
        productoId:          r.productId,
        tipo:                r.tipo,
        fecha:               r.fecha,
        cantidad:            r.cantidad,
        costoUnitario:       r.costoUnitario,
        moneda:              r.moneda ?? 'B',
        costoMoneda:         r.costoMoneda  ?? null,
        tasaDolar:           r.tasaDolar    ?? null,
        referencia:          r.referencia ?? '',
        notas:               r.notas      ?? '',
        descuentoTipo:       r.descuentoTipo  ?? '',
        descuentoValor:      r.descuentoValor ?? 0,
        descuentoMonto:      r.descuentoMonto ?? 0,
        recargoTipo:         r.recargoTipo    ?? '',
        recargoValor:        r.recargoValor   ?? 0,
        recargoMonto:        r.recargoMonto   ?? 0,
        baseIva:             r.baseIva        ?? null,
        precioVentaUnitario: r.precioVentaUnitario ?? null,
    };
}

function fromRpcRow(raw: Record<string, unknown>): MovementDraftRow {
    return {
        id:              (raw.id as string | undefined) ?? undefined,
        productId:       (raw.productoId ?? raw.producto_id) as string,
        tipo:            (raw.tipo as MovementType),
        fecha:           raw.fecha as string,
        cantidad:        num(raw.cantidad as number | string | null),
        costoUnitario:   num((raw.costoUnitario ?? raw.costo_unitario) as number | string | null),
        moneda:          (raw.moneda === 'D' ? 'D' : 'B'),
        costoMoneda:     raw.costoMoneda  != null ? Number(raw.costoMoneda) : null,
        tasaDolar:       raw.tasaDolar    != null ? Number(raw.tasaDolar)   : null,
        referencia:      (raw.referencia as string | null) ?? '',
        notas:           (raw.notas as string | null) ?? '',
        descuentoTipo:   adjKind((raw.descuentoTipo ?? raw.descuento_tipo) as string | null),
        descuentoValor:  num((raw.descuentoValor ?? raw.descuento_valor) as number | string | null),
        descuentoMonto:  num((raw.descuentoMonto ?? raw.descuento_monto) as number | string | null),
        recargoTipo:     adjKind((raw.recargoTipo ?? raw.recargo_tipo) as string | null),
        recargoValor:    num((raw.recargoValor ?? raw.recargo_valor) as number | string | null),
        recargoMonto:    num((raw.recargoMonto ?? raw.recargo_monto) as number | string | null),
        baseIva:         (raw.baseIva ?? raw.base_iva) != null
            ? num((raw.baseIva ?? raw.base_iva) as number | string | null)
            : undefined,
        precioVentaUnitario: (raw.precioVentaUnitario ?? raw.precio_venta_unitario) != null
            ? num((raw.precioVentaUnitario ?? raw.precio_venta_unitario) as number | string | null)
            : null,
    };
}

export class RpcMovementDraftRepository implements IMovementDraftRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async save(input: MovementDraftSaveInput): Promise<Result<MovementDraftSaveResult>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_movimientos_draft_save', {
                    p_user_id:        this.userId,
                    p_empresa_id:     input.companyId,
                    p_draft_group_id: input.draftGroupId ?? null,
                    p_kind:           input.kind,
                    p_direction:      input.direction,
                    p_iva_mode:       input.ivaMode,
                    p_context:        input.context ?? {},
                    p_movements:      input.movements.map(toRpcRow),
                });
            if (error) return Result.fail(error.message);
            const row = (data ?? {}) as { draftGroupId: string; count: number; updatedAt: string };
            return Result.success({
                draftGroupId: row.draftGroupId,
                count:        Number(row.count ?? 0),
                updatedAt:    row.updatedAt,
            });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to save draft');
        }
    }

    async confirm(companyId: string, draftGroupId: string): Promise<Result<MovementDraftConfirmResult>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_movimientos_draft_confirmar_grupo', {
                    p_user_id:        this.userId,
                    p_empresa_id:     companyId,
                    p_draft_group_id: draftGroupId,
                });
            if (error) return Result.fail(error.message);
            const row = (data ?? {}) as { count: number; confirmedIds: string[] | null };
            return Result.success({
                count:        Number(row.count ?? 0),
                confirmedIds: Array.isArray(row.confirmedIds) ? row.confirmedIds : [],
            });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to confirm draft group');
        }
    }

    async listLatest(companyId: string, kind: MovementDraftKind): Promise<Result<MovementDraftSummary | null>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_movimientos_draft_listar_ultimo', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                    p_kind:       kind,
                });
            if (error) return Result.fail(error.message);
            if (!data) return Result.success(null);
            const row = data as Record<string, unknown>;
            return Result.success({
                draftGroupId:  String(row.draftGroupId),
                kind:          row.kind as MovementDraftKind,
                direction:     row.direction as MovementDraftDirection,
                ivaMode:       row.ivaMode as MovementDraftIvaMode,
                context:       (row.context as Record<string, unknown>) ?? {},
                count:         Number(row.count ?? 0),
                totalCantidad: Number(row.totalCantidad ?? 0),
                updatedAt:     String(row.updatedAt),
            });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to list drafts');
        }
    }

    async getGroup(companyId: string, draftGroupId: string): Promise<Result<MovementDraftGroup | null>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_movimientos_draft_get_grupo', {
                    p_user_id:        this.userId,
                    p_empresa_id:     companyId,
                    p_draft_group_id: draftGroupId,
                });
            if (error) return Result.fail(error.message);
            if (!data) return Result.success(null);
            const payload = data as { meta: Record<string, unknown>; items: Record<string, unknown>[] };
            const meta = payload.meta;
            return Result.success({
                meta: {
                    draftGroupId: String(meta.draftGroupId),
                    kind:         meta.kind as MovementDraftKind,
                    direction:    meta.direction as MovementDraftDirection,
                    ivaMode:      meta.ivaMode as MovementDraftIvaMode,
                    context:      (meta.context as Record<string, unknown>) ?? {},
                    fecha:        String(meta.fecha),
                    updatedAt:    String(meta.updatedAt),
                },
                items: (payload.items ?? []).map(fromRpcRow),
            });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch draft group');
        }
    }

    async discard(companyId: string, draftGroupId: string): Promise<Result<{ deleted: number }>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_movimientos_draft_descartar', {
                    p_user_id:        this.userId,
                    p_empresa_id:     companyId,
                    p_draft_group_id: draftGroupId,
                });
            if (error) return Result.fail(error.message);
            const row = (data ?? {}) as { deleted: number };
            return Result.success({ deleted: Number(row.deleted ?? 0) });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to discard draft');
        }
    }
}
