// save-movement.use-case — creates a new inventory movement, enforcing stock constraints for outbound types.
// Role: application command handler for the Movement domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Movement, MovementType } from '../domain/movement';
import { IMovementRepository } from '../domain/repository/movement.repository';

const OUTBOUND_TYPES: MovementType[] = [
    'autoconsumo', 'salida', 'salida_produccion',
    'ajuste_negativo', 'devolucion_entrada',
];

export class SaveMovementUseCase extends UseCase<Movement, Movement> {
    constructor(private readonly repo: IMovementRepository) { super(); }

    async execute(movement: Movement): Promise<Result<Movement>> {
        if (!movement.productId) return Result.fail('productId is required');
        if (!movement.companyId) return Result.fail('companyId is required');
        if (!movement.quantity || movement.quantity <= 0) return Result.fail('Quantity must be greater than 0');

        if (
            OUTBOUND_TYPES.includes(movement.type) &&
            movement.currentStock !== undefined &&
            movement.quantity > movement.currentStock
        ) {
            return Result.fail(`Insufficient stock. Current: ${movement.currentStock}`);
        }

        return this.repo.save(movement);
    }
}
