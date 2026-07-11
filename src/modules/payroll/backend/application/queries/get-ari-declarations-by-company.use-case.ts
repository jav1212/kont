// src/modules/payroll/backend/application/queries/get-ari-declarations-by-company.use-case.ts
//
// Query — devuelve todas las declaraciones AR-I de una empresa. No muta estado.

import { Result }                    from '@/src/core/domain/result';
import { IAriDeclarationRepository } from '../../domain/repository/ari-declaration.repository';
import { AriDeclaration }            from '../../domain/ari-declaration';

export class GetAriDeclarationsByCompanyUseCase {
    constructor(private readonly repo: IAriDeclarationRepository) {}

    async execute(companyId: string): Promise<Result<AriDeclaration[]>> {
        return this.repo.findByCompany(companyId);
    }
}
