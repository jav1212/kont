import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { LibroInventariosRow } from '../domain/libro-inventarios';
import { ILibroInventariosRepository } from '../domain/repository/libro-inventarios.repository';

interface Input { empresaId: string; anio: number; }

export class GetLibroInventariosUseCase extends UseCase<Input, LibroInventariosRow[]> {
    constructor(private readonly repo: ILibroInventariosRepository) { super(); }

    async execute({ empresaId, anio }: Input): Promise<Result<LibroInventariosRow[]>> {
        if (!anio || anio < 2000 || anio > 2100)
            return Result.fail('Año inválido.');
        return this.repo.getLibroInventarios(empresaId, anio);
    }
}
