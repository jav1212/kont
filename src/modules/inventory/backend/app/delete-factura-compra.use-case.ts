import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IFacturaCompraRepository } from '../domain/repository/factura-compra.repository';

interface Input { facturaId: string; }

export class DeleteFacturaCompraUseCase extends UseCase<Input, void> {
    constructor(private readonly repo: IFacturaCompraRepository) { super(); }

    async execute({ facturaId }: Input): Promise<Result<void>> {
        if (!facturaId) return Result.fail('facturaId es requerido');
        return this.repo.delete(facturaId);
    }
}
