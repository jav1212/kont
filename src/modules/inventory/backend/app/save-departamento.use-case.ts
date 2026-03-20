import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Departamento } from '../domain/departamento';
import { IDepartamentoRepository } from '../domain/repository/departamento.repository';

export class SaveDepartamentoUseCase extends UseCase<Departamento, Departamento> {
    constructor(private readonly repo: IDepartamentoRepository) { super(); }

    async execute(departamento: Departamento): Promise<Result<Departamento>> {
        if (!departamento.nombre?.trim()) return Result.fail('El nombre es requerido');
        return this.repo.upsert(departamento);
    }
}
