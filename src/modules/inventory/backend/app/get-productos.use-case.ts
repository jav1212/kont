import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Producto } from '../domain/producto';
import { IProductoRepository } from '../domain/repository/producto.repository';

interface Input { empresaId: string; }

export class GetProductosUseCase extends UseCase<Input, Producto[]> {
    constructor(private readonly repo: IProductoRepository) { super(); }

    async execute({ empresaId }: Input): Promise<Result<Producto[]>> {
        return this.repo.findByEmpresa(empresaId);
    }
}
