// src/modules/payroll/backend/application/commands/delete-ari-declaration.use-case.ts
//
// Command — elimina una declaración AR-I por id.

import { Result }                    from '@/src/core/domain/result';
import { IAriDeclarationRepository } from '../../domain/repository/ari-declaration.repository';

export class DeleteAriDeclarationUseCase {
    constructor(private readonly repo: IAriDeclarationRepository) {}

    async execute(id: string): Promise<Result<void>> {
        return this.repo.delete(id);
    }
}
