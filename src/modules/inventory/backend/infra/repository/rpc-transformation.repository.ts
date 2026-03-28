// rpc-transformation.repository.ts — Supabase RPC adapter for the Transformation entity.
// Role: infrastructure — implements ITransformationRepository via Postgres RPC.
// Invariant: all DB RPC function names are unchanged (DB contract).
import { SupabaseClient } from '@supabase/supabase-js';
import { ITransformationRepository } from '../../domain/repository/transformation.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Transformation } from '../../domain/transformation';

// Infrastructure DTO — shape of the raw Postgres RPC row returned by tenant_inventario_transformaciones_get.
interface TransformationRpcRow {
  id: string | null;
  empresa_id: string;
  descripcion: string | null;
  fecha: string;
  periodo: string;
  producto_terminado_id: string | null;
  cantidad_producida: number | null;
  notas: string | null;
  created_at: string | null;
}

export class RpcTransformationRepository implements ITransformationRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<Transformation[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_transformaciones_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as TransformationRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch transformations');
        }
    }

    async save(transformation: Transformation): Promise<Result<Transformation>> {
        try {
            const row = {
                id:                    transformation.id ?? '',
                empresa_id:            transformation.companyId,
                descripcion:           transformation.description,
                fecha:                 transformation.date,
                periodo:               transformation.period,
                producto_terminado_id: transformation.finishedProductId ?? '',
                cantidad_producida:    transformation.producedQuantity,
                notas:                 transformation.notes,
            };
            const inputs = (transformation.inputs ?? []).map((c) => ({
                producto_id:    c.productId,
                cantidad:       c.quantity,
                costo_unitario: c.unitCost,
            }));
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_transformacion_save', {
                    p_user_id:        this.userId,
                    p_transformacion: row,
                    p_consumos:       inputs,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as TransformationRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to save transformation');
        }
    }

    private mapToDomain(row: TransformationRpcRow): Transformation {
        return {
            id:                row.id ?? undefined,
            companyId:         row.empresa_id,
            description:       row.descripcion ?? '',
            date:              row.fecha,
            period:            row.periodo,
            finishedProductId: row.producto_terminado_id ?? null,
            producedQuantity:  Number(row.cantidad_producida ?? 0),
            notes:             row.notas ?? '',
            createdAt:         row.created_at ?? undefined,
        };
    }
}
