// src/modules/payroll/backend/application/commands/save-ari-declaration.use-case.ts
//
// Command — persiste una declaración AR-I. Recalcula el porcentaje de retención
// con computeAri (fuente de verdad del dominio) antes de guardar, de modo que el
// valor persistido no dependa de un número enviado por el cliente.

import { Result }                    from '@/src/core/domain/result';
import { IAriDeclarationRepository } from '../../domain/repository/ari-declaration.repository';
import { AriDeclaration, computeAri } from '../../domain/ari-declaration';

export class SaveAriDeclarationUseCase {
    constructor(private readonly repo: IAriDeclarationRepository) {}

    async execute(declaration: AriDeclaration): Promise<Result<void>> {
        // AriDeclaration extiende AriDeclarationInput, así que computeAri puede
        // recibir la declaración completa directamente.
        const { porcentaje } = computeAri(declaration);
        return this.repo.upsert({ ...declaration, porcentajeRetencion: porcentaje });
    }
}
