import { SupabaseClient } from '@supabase/supabase-js';
import { ILibroComprasRepository } from '../../domain/repository/libro-compras.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { LibroComprasRow } from '../../domain/libro-compras';

export class RpcLibroComprasRepository implements ILibroComprasRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getLibroCompras(empresaId: string, periodo: string): Promise<Result<LibroComprasRow[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_libro_compras', {
                    p_user_id:    this.userId,
                    p_empresa_id: empresaId,
                    p_periodo:    periodo,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as Record<string, unknown>[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener libro de compras');
        }
    }

    private mapToDomain(row: Record<string, unknown>): LibroComprasRow {
        return {
            id:               (row.id as string | null) ?? '',
            fecha:            (row.fecha as string | null) ?? '',
            numeroFactura:    (row.numero_factura as string | null) ?? '',
            numeroControl:    (row.numero_control as string | null) ?? '',
            proveedorRif:     (row.proveedor_rif as string | null) ?? '',
            proveedorNombre:  (row.proveedor_nombre as string | null) ?? '',
            baseExenta:       Number(row.base_exenta    ?? 0),
            baseGravada8:     Number(row.base_gravada_8 ?? 0),
            iva8:             Number(row.iva_8          ?? 0),
            baseGravada16:    Number(row.base_gravada_16 ?? 0),
            iva16:            Number(row.iva_16         ?? 0),
            total:            Number(row.total          ?? 0),
        };
    }
}
