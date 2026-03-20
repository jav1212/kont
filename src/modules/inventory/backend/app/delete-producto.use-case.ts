import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IProductoRepository } from '../domain/repository/producto.repository';

interface Input { id: string; }

export class DeleteProductoUseCase extends UseCase<Input, void> {
    constructor(private readonly repo: IProductoRepository) { super(); }

    async execute({ id }: Input): Promise<Result<void>> {
        if (!id) return Result.fail('id es requerido');
        return this.repo.delete(id);
    }
}
