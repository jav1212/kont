import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { FacturaCompra } from '../domain/factura-compra';
import { IFacturaCompraRepository } from '../domain/repository/factura-compra.repository';

interface Input { facturaId: string; }

export class GetFacturaCompraUseCase extends UseCase<Input, FacturaCompra> {
    constructor(private readonly repo: IFacturaCompraRepository) { super(); }

    async execute({ facturaId }: Input): Promise<Result<FacturaCompra>> {
        if (!facturaId) return Result.fail('facturaId es requerido');
        return this.repo.findById(facturaId);
    }
}
