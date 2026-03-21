import { SupabaseClient } from '@supabase/supabase-js';
import { ILibroVentasRepository } from '../../domain/repository/libro-ventas.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { LibroVentasRow } from '../../domain/libro-ventas';

export class RpcLibroVentasRepository implements ILibroVentasRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getLibroVentas(empresaId: string, periodo: string): Promise<Result<LibroVentasRow[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_libro_ventas', {
                    p_user_id:    this.userId,
                    p_empresa_id: empresaId,
                    p_periodo:    periodo,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as any[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener libro de ventas');
        }
    }

    private mapToDomain(row: any): LibroVentasRow {
        return {
            id:             row.id ?? '',
            fecha:          row.fecha ?? '',
            numeroFactura:  row.numero_factura ?? '',
            clienteRif:     row.cliente_rif ?? '',
            clienteNombre:  row.cliente_nombre ?? '',
            baseExenta:     Number(row.base_exenta ?? 0),
            baseGravada8:   Number(row.base_gravada_8 ?? 0),
            iva8:           Number(row.iva_8 ?? 0),
            baseGravada16:  Number(row.base_gravada_16 ?? 0),
            iva16:          Number(row.iva_16 ?? 0),
            autoconsumo:    Number(row.autoconsumo ?? 0),
            ivaAutoconsumo: Number(row.iva_autoconsumo ?? 0),
            total:          Number(row.total ?? 0),
            tipo:           row.tipo === 'autoconsumo' ? 'autoconsumo' : 'venta',
        };
    }
}
