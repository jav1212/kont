import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Proveedor } from '../domain/proveedor';
import { IProveedorRepository } from '../domain/repository/proveedor.repository';

interface Input { empresaId: string; }

export class GetProveedoresUseCase extends UseCase<Input, Proveedor[]> {
    constructor(private readonly repo: IProveedorRepository) { super(); }

    async execute({ empresaId }: Input): Promise<Result<Proveedor[]>> {
        return this.repo.findByEmpresa(empresaId);
    }
}
