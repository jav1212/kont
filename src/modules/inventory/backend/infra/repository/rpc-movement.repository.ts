// rpc-movement.repository.ts — Supabase RPC adapter for Movement.
// Role: infrastructure — implements IMovementRepository via Postgres RPC.
// Invariant: all DB RPC function names are unchanged (DB contract).
import { SupabaseClient } from '@supabase/supabase-js';
import { IMovementRepository } from '../../domain/repository/movement.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Movement, MovementType, MovementAdjustmentKind } from '../../domain/movement';

// Infrastructure DTO — shape of the raw Postgres RPC row.
interface MovementRpcRow {
  id: string | null;
  empresa_id: string;
  producto_id: string;
  tipo: MovementType;
  fecha: string;
  periodo: string;
  cantidad: number | null;
  costo_unitario: number | null;
  costo_total: number | null;
  saldo_cantidad: number | null;
  referencia: string | null;
  notas: string | null;
  moneda: string | null;
  costo_moneda: number | null;
  tasa_dolar: number | null;
  descuento_tipo: string | null;
  descuento_valor: number | string | null;
  descuento_monto: number | string | null;
  recargo_tipo: string | null;
  recargo_valor: number | string | null;
  recargo_monto: number | string | null;
  base_iva: number | string | null;
  precio_venta_unitario: number | string | null;
  created_at: string | null;
}

const num = (v: number | string | null | undefined, fallback = 0): number =>
    v == null || v === '' ? fallback : Number(v);

const adjKind = (v: string | null | undefined): MovementAdjustmentKind | null =>
    v === 'monto' || v === 'porcentaje' ? v : null;

const stringifyAdj = (v: MovementAdjustmentKind | null | undefined): string => v ?? '';
const stringifyNum = (v: number | null | undefined): string =>
    v != null && Number.isFinite(v) && v !== 0 ? String(v) : '';

export class RpcMovementRepository implements IMovementRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string, period?: string): Promise<Result<Movement[]>> {
        try {
            const params: Record<string, string> = {
                p_user_id:    this.userId,
                p_empresa_id: companyId,
            };
            if (period) params['p_periodo'] = period;

            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_movimientos_get', params);
            if (error) return Result.fail(error.message);
            return Result.success((data as MovementRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch movements');
        }
    }

    async save(movement: Movement): Promise<Result<Movement>> {
        try {
            const row = {
                id:                movement.id ?? '',
                empresa_id:        movement.companyId,
                producto_id:       movement.productId,
                tipo:              movement.type,
                fecha:             movement.date,
                periodo:           movement.period,
                cantidad:          movement.quantity,
                costo_unitario:    movement.unitCost,
                costo_total:       movement.totalCost,
                saldo_cantidad:    movement.balanceQuantity,
                referencia:        movement.reference,
                notas:             movement.notes,
                moneda:            movement.currency ?? 'B',
                costo_moneda:      movement.currencyCost ?? null,
                tasa_dolar:        movement.dollarRate ?? null,
                descuento_tipo:    stringifyAdj(movement.descuentoTipo),
                descuento_valor:   stringifyNum(movement.descuentoValor),
                descuento_monto:   stringifyNum(movement.descuentoMonto),
                recargo_tipo:      stringifyAdj(movement.recargoTipo),
                recargo_valor:     stringifyNum(movement.recargoValor),
                recargo_monto:     stringifyNum(movement.recargoMonto),
                base_iva:          movement.baseIVA != null ? String(movement.baseIVA) : '',
                precio_venta_unitario:
                    movement.precioVentaUnitario != null ? String(movement.precioVentaUnitario) : '',
            };
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_movimientos_save', {
                    p_user_id: this.userId,
                    p_row:     row,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as MovementRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to save movement');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_inventario_movimiento_delete', {
                    p_user_id: this.userId,
                    p_id:      id,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to delete movement');
        }
    }

    async getInboundTotal(companyId: string, period: string): Promise<Result<number>> {
        const result = await this.findByCompany(companyId, period);
        if (result.isFailure) return Result.fail(result.getError());
        const movements = result.getValue();
        const INBOUND_TYPES: MovementType[] = ['entrada', 'devolucion_salida', 'ajuste_positivo'];
        const total = movements
            .filter((m) => INBOUND_TYPES.includes(m.type))
            .reduce((sum, m) => sum + (m.totalCost ?? 0), 0);
        return Result.success(total);
    }

    async updateMeta(id: string, date: string, reference: string, notes: string): Promise<Result<Movement>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_movimiento_update_meta', {
                    p_user_id:    this.userId,
                    p_id:         id,
                    p_fecha:      date,
                    p_referencia: reference,
                    p_notas:      notes,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as MovementRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to update movement metadata');
        }
    }

    private mapToDomain(row: MovementRpcRow): Movement {
        return {
            id:               row.id ?? undefined,
            companyId:        row.empresa_id,
            productId:        row.producto_id,
            type:             row.tipo,
            date:             row.fecha,
            period:           row.periodo,
            quantity:         num(row.cantidad),
            unitCost:         num(row.costo_unitario),
            totalCost:        num(row.costo_total),
            balanceQuantity:  num(row.saldo_cantidad),
            reference:        row.referencia ?? '',
            notes:            row.notas ?? '',
            currency:         (row.moneda === 'D' ? 'D' : 'B') as 'B' | 'D',
            currencyCost:     row.costo_moneda != null ? Number(row.costo_moneda) : null,
            dollarRate:       row.tasa_dolar   != null ? Number(row.tasa_dolar)   : null,
            descuentoTipo:    adjKind(row.descuento_tipo),
            descuentoValor:   num(row.descuento_valor),
            descuentoMonto:   num(row.descuento_monto),
            recargoTipo:      adjKind(row.recargo_tipo),
            recargoValor:     num(row.recargo_valor),
            recargoMonto:     num(row.recargo_monto),
            baseIVA:          num(row.base_iva, num(row.costo_total)),
            precioVentaUnitario: row.precio_venta_unitario == null || row.precio_venta_unitario === ''
                ? null
                : Number(row.precio_venta_unitario),
            createdAt:        row.created_at ?? undefined,
        };
    }
}
