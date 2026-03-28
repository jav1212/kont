// rpc-movement.repository.ts — Supabase RPC adapter for Movement and Kardex.
// Role: infrastructure — implements IMovementRepository via Postgres RPC.
// Invariant: all DB RPC function names are unchanged (DB contract).
import { SupabaseClient } from '@supabase/supabase-js';
import { IMovementRepository } from '../../domain/repository/movement.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Movement, KardexEntry, MovementType } from '../../domain/movement';

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
  transformacion_id: string | null;
  moneda: string | null;
  costo_moneda: number | null;
  tasa_dolar: number | null;
  created_at: string | null;
  // Kardex only
  producto_nombre?: string | null;
}

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
                transformacion_id: movement.transformationId ?? null,
                moneda:            movement.currency ?? 'B',
                costo_moneda:      movement.currencyCost ?? null,
                tasa_dolar:        movement.dollarRate ?? null,
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

    async getKardex(companyId: string, productId: string): Promise<Result<KardexEntry[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_kardex', {
                    p_user_id:     this.userId,
                    p_empresa_id:  companyId,
                    p_producto_id: productId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as MovementRpcRow[] ?? []).map(this.mapToKardex));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch kardex');
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
            quantity:         Number(row.cantidad ?? 0),
            unitCost:         Number(row.costo_unitario ?? 0),
            totalCost:        Number(row.costo_total ?? 0),
            balanceQuantity:  Number(row.saldo_cantidad ?? 0),
            reference:        row.referencia ?? '',
            notes:            row.notas ?? '',
            transformationId: row.transformacion_id ?? null,
            currency:         (row.moneda === 'D' ? 'D' : 'B') as 'B' | 'D',
            currencyCost:     row.costo_moneda != null ? Number(row.costo_moneda) : null,
            dollarRate:       row.tasa_dolar   != null ? Number(row.tasa_dolar)   : null,
            createdAt:        row.created_at ?? undefined,
        };
    }

    private mapToKardex(row: MovementRpcRow): KardexEntry {
        return {
            id:               row.id ?? undefined,
            companyId:        row.empresa_id,
            productId:        row.producto_id,
            type:             row.tipo,
            date:             row.fecha,
            period:           row.periodo,
            quantity:         Number(row.cantidad ?? 0),
            unitCost:         Number(row.costo_unitario ?? 0),
            totalCost:        Number(row.costo_total ?? 0),
            balanceQuantity:  Number(row.saldo_cantidad ?? 0),
            reference:        row.referencia ?? '',
            notes:            row.notas ?? '',
            transformationId: row.transformacion_id ?? null,
            currency:         (row.moneda === 'D' ? 'D' : 'B') as 'B' | 'D',
            currencyCost:     row.costo_moneda != null ? Number(row.costo_moneda) : null,
            dollarRate:       row.tasa_dolar   != null ? Number(row.tasa_dolar)   : null,
            createdAt:        row.created_at ?? undefined,
            productName:      row.producto_nombre ?? undefined,
        };
    }
}
