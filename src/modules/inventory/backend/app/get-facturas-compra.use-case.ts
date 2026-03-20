import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { FacturaCompra } from '../domain/factura-compra';
import { IFacturaCompraRepository } from '../domain/repository/factura-compra.repository';

interface Input { empresaId: string; }

export class GetFacturasCompraUseCase extends UseCase<Input, FacturaCompra[]> {
    constructor(private readonly repo: IFacturaCompraRepository) { super(); }

    async execute({ empresaId }: Input): Promise<Result<FacturaCompra[]>> {
        return this.repo.findByEmpresa(empresaId);
    }
}
