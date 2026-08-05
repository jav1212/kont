import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IMovementDraftRepository } from '../../domain/repository/movement-draft.repository';
import type {
    MovementDraftConfirmResult, MovementDraftDirection, MovementDraftGroup,
    MovementDraftIvaMode, MovementDraftKind, MovementDraftRow,
    MovementDraftSaveInput, MovementDraftSaveResult, MovementDraftSummary,
} from '../../domain/movement-draft';
import type { MovementAdjustmentKind, MovementType } from '../../domain/movement';

const num = (value: unknown) => value == null || value === '' ? 0 : Number(value);
const adj = (value: unknown): MovementAdjustmentKind | null => value === 'monto' || value === 'porcentaje' ? value : null;

function toRow(row: MovementDraftRow): Record<string, unknown> {
    return {
        id: row.id ?? '', productoId: row.productId, tipo: row.tipo, fecha: row.fecha,
        cantidad: row.cantidad, costoUnitario: row.costoUnitario, moneda: row.moneda ?? 'B',
        costoMoneda: row.costoMoneda ?? null, tasaDolar: row.tasaDolar ?? null,
        referencia: row.referencia ?? '', notas: row.notas ?? '',
        descuentoTipo: row.descuentoTipo ?? '', descuentoValor: row.descuentoValor ?? 0,
        descuentoMonto: row.descuentoMonto ?? 0, recargoTipo: row.recargoTipo ?? '',
        recargoValor: row.recargoValor ?? 0, recargoMonto: row.recargoMonto ?? 0,
        baseIva: row.baseIva ?? null, precioVentaUnitario: row.precioVentaUnitario ?? null,
    };
}

function fromRow(raw: Record<string, unknown>): MovementDraftRow {
    return {
        id: raw.id as string | undefined,
        productId: (raw.productoId ?? raw.producto_id) as string,
        tipo: raw.tipo as MovementType, fecha: raw.fecha as string,
        cantidad: num(raw.cantidad), costoUnitario: num(raw.costoUnitario ?? raw.costo_unitario),
        moneda: raw.moneda === 'D' ? 'D' : 'B',
        costoMoneda: raw.costoMoneda != null ? num(raw.costoMoneda) : null,
        tasaDolar: raw.tasaDolar != null ? num(raw.tasaDolar) : null,
        referencia: (raw.referencia as string) ?? '', notas: (raw.notas as string) ?? '',
        descuentoTipo: adj(raw.descuentoTipo ?? raw.descuento_tipo),
        descuentoValor: num(raw.descuentoValor ?? raw.descuento_valor),
        descuentoMonto: num(raw.descuentoMonto ?? raw.descuento_monto),
        recargoTipo: adj(raw.recargoTipo ?? raw.recargo_tipo),
        recargoValor: num(raw.recargoValor ?? raw.recargo_valor),
        recargoMonto: num(raw.recargoMonto ?? raw.recargo_monto),
        baseIva: (raw.baseIva ?? raw.base_iva) == null ? undefined : num(raw.baseIva ?? raw.base_iva),
        precioVentaUnitario: (raw.precioVentaUnitario ?? raw.precio_venta_unitario) == null
            ? null : num(raw.precioVentaUnitario ?? raw.precio_venta_unitario),
    };
}

export class SharedMovementDraftRepository implements IMovementDraftRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async save(input: MovementDraftSaveInput): Promise<Result<MovementDraftSaveResult>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_inventory_movement_draft_save', {
                p_tenant_id: this.tenantId, p_company_id: input.companyId,
                p_draft_group_id: input.draftGroupId ?? null, p_kind: input.kind,
                p_direction: input.direction, p_iva_mode: input.ivaMode,
                p_context: input.context ?? {}, p_movements: input.movements.map(toRow),
            });
            if (error) return Result.fail(error.message);
            const row = (data ?? {}) as Record<string, unknown>;
            return Result.success({ draftGroupId: String(row.draftGroupId), count: num(row.count), updatedAt: String(row.updatedAt) });
        } catch (error) { return Result.fail(error instanceof Error ? error.message : 'Failed to save shared draft'); }
    }

    async confirm(companyId: string, draftGroupId: string): Promise<Result<MovementDraftConfirmResult>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_inventory_movement_draft_confirm', {
                p_tenant_id: this.tenantId, p_company_id: companyId, p_draft_group_id: draftGroupId,
            });
            if (error) return Result.fail(error.message);
            const row = (data ?? {}) as { count?: number; confirmedIds?: string[] };
            return Result.success({ count: Number(row.count ?? 0), confirmedIds: Array.isArray(row.confirmedIds) ? row.confirmedIds : [] });
        } catch (error) { return Result.fail(error instanceof Error ? error.message : 'Failed to confirm shared draft'); }
    }

    async listLatest(companyId: string, kind: MovementDraftKind): Promise<Result<MovementDraftSummary | null>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_inventory_movement_draft_latest', {
                p_tenant_id: this.tenantId, p_company_id: companyId, p_kind: kind,
            });
            if (error) return Result.fail(error.message);
            if (!data) return Result.success(null);
            const row = data as Record<string, unknown>;
            return Result.success({ draftGroupId: String(row.draftGroupId), kind: row.kind as MovementDraftKind,
                direction: row.direction as MovementDraftDirection, ivaMode: row.ivaMode as MovementDraftIvaMode,
                context: (row.context as Record<string, unknown>) ?? {}, count: num(row.count),
                totalCantidad: num(row.totalCantidad), updatedAt: String(row.updatedAt) });
        } catch (error) { return Result.fail(error instanceof Error ? error.message : 'Failed to list shared drafts'); }
    }

    async getGroup(companyId: string, draftGroupId: string): Promise<Result<MovementDraftGroup | null>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_inventory_movement_draft_get', {
                p_tenant_id: this.tenantId, p_company_id: companyId, p_draft_group_id: draftGroupId,
            });
            if (error) return Result.fail(error.message);
            if (!data) return Result.success(null);
            const payload = data as { meta: Record<string, unknown>; items: Record<string, unknown>[] };
            const meta = payload.meta;
            return Result.success({ meta: { draftGroupId: String(meta.draftGroupId), kind: meta.kind as MovementDraftKind,
                direction: meta.direction as MovementDraftDirection, ivaMode: meta.ivaMode as MovementDraftIvaMode,
                context: (meta.context as Record<string, unknown>) ?? {}, fecha: String(meta.fecha), updatedAt: String(meta.updatedAt) },
                items: (payload.items ?? []).map(fromRow) });
        } catch (error) { return Result.fail(error instanceof Error ? error.message : 'Failed to get shared draft'); }
    }

    async discard(companyId: string, draftGroupId: string): Promise<Result<{ deleted: number }>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_inventory_movement_draft_discard', {
                p_tenant_id: this.tenantId, p_company_id: companyId, p_draft_group_id: draftGroupId,
            });
            if (error) return Result.fail(error.message);
            return Result.success({ deleted: num((data as Record<string, unknown> | null)?.deleted) });
        } catch (error) { return Result.fail(error instanceof Error ? error.message : 'Failed to discard shared draft'); }
    }
}
