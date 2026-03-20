import { SupabaseClient } from '@supabase/supabase-js';
import { ILibroInventariosRepository } from '../../domain/repository/libro-inventarios.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { LibroInventariosRow } from '../../domain/libro-inventarios';

export class RpcLibroInventariosRepository implements ILibroInventariosRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getLibroInventarios(empresaId: string, anio: number): Promise<Result<LibroInventariosRow[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_libro_inventarios', {
                    p_user_id:    this.userId,
                    p_empresa_id: empresaId,
                    p_anio:       anio,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as any[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener libro de inventarios');
        }
    }

    private mapToDomain(row: any): LibroInventariosRow {
        return {
            id:            row.id ?? '',
            codigo:        row.codigo ?? '',
            nombre:        row.nombre ?? '',
            tipo:          row.tipo ?? '',
            unidadMedida:  row.unidad_medida ?? '',
            cantInicial:   Number(row.cant_inicial   ?? 0),
            valorInicial:  Number(row.valor_inicial  ?? 0),
            cantEntradas:  Number(row.cant_entradas  ?? 0),
            valorEntradas: Number(row.valor_entradas ?? 0),
            cantSalidas:   Number(row.cant_salidas   ?? 0),
            valorSalidas:  Number(row.valor_salidas  ?? 0),
            cantFinal:     Number(row.cant_final     ?? 0),
            valorFinal:    Number(row.valor_final    ?? 0),
            valorCompras:  Number(row.valor_compras  ?? 0),
        };
    }
}
