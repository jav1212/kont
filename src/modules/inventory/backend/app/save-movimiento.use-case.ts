import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Movimiento, TipoMovimiento } from '../domain/movimiento';
import { IMovimientoRepository } from '../domain/repository/movimiento.repository';

const TIPOS_SALIDA: TipoMovimiento[] = [
    'autoconsumo', 'salida', 'salida_produccion',
    'ajuste_negativo', 'devolucion_entrada',
];

export class SaveMovimientoUseCase extends UseCase<Movimiento, Movimiento> {
    constructor(private readonly repo: IMovimientoRepository) { super(); }

    async execute(movimiento: Movimiento): Promise<Result<Movimiento>> {
        if (!movimiento.productoId) return Result.fail('producto_id es requerido');
        if (!movimiento.empresaId) return Result.fail('empresa_id es requerido');
        if (!movimiento.cantidad || movimiento.cantidad <= 0) return Result.fail('La cantidad debe ser mayor a 0');

        if (
            TIPOS_SALIDA.includes(movimiento.tipo) &&
            movimiento.existenciaActual !== undefined &&
            movimiento.cantidad > movimiento.existenciaActual
        ) {
            return Result.fail(
                `Stock insuficiente. Existencia actual: ${movimiento.existenciaActual}`,
            );
        }

        return this.repo.save(movimiento);
    }
}
