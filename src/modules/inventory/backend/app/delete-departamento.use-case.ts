import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IDepartamentoRepository } from '../domain/repository/departamento.repository';

interface Input { id: string; }

export class DeleteDepartamentoUseCase extends UseCase<Input, void> {
    constructor(private readonly repo: IDepartamentoRepository) { super(); }

    async execute({ id }: Input): Promise<Result<void>> {
        return this.repo.delete(id);
    }
}
