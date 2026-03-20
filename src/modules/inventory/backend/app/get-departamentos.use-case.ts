import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Departamento } from '../domain/departamento';
import { IDepartamentoRepository } from '../domain/repository/departamento.repository';

interface Input { empresaId: string; }

export class GetDepartamentosUseCase extends UseCase<Input, Departamento[]> {
    constructor(private readonly repo: IDepartamentoRepository) { super(); }

    async execute({ empresaId }: Input): Promise<Result<Departamento[]>> {
        return this.repo.findByEmpresa(empresaId);
    }
}
