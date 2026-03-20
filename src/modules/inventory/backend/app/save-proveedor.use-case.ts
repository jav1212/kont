import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Proveedor } from '../domain/proveedor';
import { IProveedorRepository } from '../domain/repository/proveedor.repository';

export class SaveProveedorUseCase extends UseCase<Proveedor, Proveedor> {
    constructor(private readonly repo: IProveedorRepository) { super(); }

    async execute(proveedor: Proveedor): Promise<Result<Proveedor>> {
        if (!proveedor.nombre?.trim()) return Result.fail('El nombre del proveedor es requerido');
        if (!proveedor.empresaId) return Result.fail('empresa_id es requerido');
        return this.repo.upsert(proveedor);
    }
}
