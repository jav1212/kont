import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IProveedorRepository } from '../domain/repository/proveedor.repository';

interface Input { id: string; }

export class DeleteProveedorUseCase extends UseCase<Input, void> {
    constructor(private readonly repo: IProveedorRepository) { super(); }

    async execute({ id }: Input): Promise<Result<void>> {
        if (!id) return Result.fail('id es requerido');
        return this.repo.delete(id);
    }
}
