// rpc-product.repository.ts — Supabase RPC adapter for the Product entity.
// Role: infrastructure — implements IProductRepository via Postgres RPC.
// Invariant: all DB RPC function names are unchanged (DB contract).
import { SupabaseClient } from '@supabase/supabase-js';
import { IProductRepository, DeleteProductOutcome } from '../../domain/repository/product.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Product, ProductType, MeasureUnit, ValuationMethod, VatType } from '../../domain/product';

// Infrastructure DTO — shape of the raw Postgres RPC row returned by tenant_inventario_productos_get.
interface ProductRpcRow {
  id: string | null;
  empresa_id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  tipo: ProductType;
  unidad_medida: MeasureUnit;
  metodo_valuacion: ValuationMethod;
  existencia_actual: number | null;
  costo_promedio: number | null;
  activo: boolean | null;
  departamento_id: string | null;
  departamento_nombre: string | null;
  iva_tipo: VatType | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

export class RpcProductRepository implements IProductRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<Product[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_productos_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as ProductRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch products');
        }
    }

    async upsert(product: Product): Promise<Result<Product>> {
        try {
            const row = {
                id:               product.id ?? '',
                empresa_id:       product.companyId,
                codigo:           product.code,
                nombre:           product.name,
                descripcion:      product.description,
                tipo:             product.type,
                unidad_medida:    product.measureUnit,
                metodo_valuacion: product.valuationMethod,
                existencia_actual: product.currentStock,
                costo_promedio:   product.averageCost,
                activo:           product.active,
                departamento_id:  product.departmentId ?? null,
                iva_tipo:         product.vatType ?? 'general',
                custom_fields:    product.customFields ?? {},
            };
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_productos_upsert', {
                    p_user_id: this.userId,
                    p_row:     row,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as ProductRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to save product');
        }
    }

    async setStock(companyId: string, productId: string, newStock: number): Promise<Result<Product>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_productos_set_existencia', {
                    p_user_id:     this.userId,
                    p_empresa_id:  companyId,
                    p_producto_id: productId,
                    p_existencia:  newStock,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as ProductRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to set product stock');
        }
    }

    async delete(id: string): Promise<Result<DeleteProductOutcome>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_productos_delete', {
                    p_user_id: this.userId,
                    p_id:      id,
                });
            if (error) return Result.fail(error.message);
            const softDeleted = Boolean((data as { soft_deleted?: boolean } | null)?.soft_deleted);
            return Result.success({ softDeleted });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to delete product');
        }
    }

    private mapToDomain(row: ProductRpcRow): Product {
        return {
            id:             row.id ?? undefined,
            companyId:      row.empresa_id,
            code:           row.codigo ?? '',
            name:           row.nombre,
            description:    row.descripcion ?? '',
            type:           row.tipo,
            measureUnit:    row.unidad_medida,
            valuationMethod: row.metodo_valuacion,
            currentStock:   Number(row.existencia_actual ?? 0),
            averageCost:    Number(row.costo_promedio ?? 0),
            active:         Boolean(row.activo ?? true),
            departmentId:   row.departamento_id ?? undefined,
            departmentName: row.departamento_nombre ?? undefined,
            vatType:        (row.iva_tipo === 'exento' ? 'exento' : 'general') as VatType,
            customFields:   (row.custom_fields && Object.keys(row.custom_fields).length > 0) ? row.custom_fields : undefined,
            createdAt:      row.created_at ?? undefined,
            updatedAt:      row.updated_at ?? undefined,
        };
    }
}
