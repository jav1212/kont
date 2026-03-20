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
            return Result.success((data as any[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener libro de compras');
        }
    }

    private mapToDomain(row: any): LibroComprasRow {
        return {
            id:               row.id ?? '',
            fecha:            row.fecha ?? '',
            numeroFactura:    row.numero_factura ?? '',
            numeroControl:    row.numero_control ?? '',
            proveedorRif:     row.proveedor_rif ?? '',
            proveedorNombre:  row.proveedor_nombre ?? '',
            baseGravada:      Number(row.base_gravada ?? 0),
            ivaGeneral:       Number(row.iva_general ?? 0),
            baseExenta:       Number(row.base_exenta ?? 0),
            total:            Number(row.total ?? 0),
        };
    }
}
