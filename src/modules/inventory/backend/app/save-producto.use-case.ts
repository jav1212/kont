import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Producto } from '../domain/producto';
import { IProductoRepository } from '../domain/repository/producto.repository';

export class SaveProductoUseCase extends UseCase<Producto, Producto> {
    constructor(private readonly repo: IProductoRepository) { super(); }

    async execute(producto: Producto): Promise<Result<Producto>> {
        if (!producto.nombre?.trim()) return Result.fail('El nombre del producto es requerido');
        if (!producto.empresaId) return Result.fail('empresa_id es requerido');
        return this.repo.upsert(producto);
    }
}
