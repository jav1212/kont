// src/modules/payroll/backend/domain/repository/ari-declaration.repository.ts
//
// Port (contrato de dominio) para la persistencia de declaraciones AR-I.
// Las implementaciones de infraestructura viven en
// src/modules/payroll/backend/infrastructure/.

import { Result }         from '@/src/core/domain/result';
import { AriDeclaration } from '../ari-declaration';

export interface IAriDeclarationRepository {
    // Todas las declaraciones AR-I de una empresa (ordenadas por año desc.).
    findByCompany(companyId: string): Promise<Result<AriDeclaration[]>>;

    // Inserta o actualiza una declaración (por employee_id + anio_gravable) y
    // propaga el porcentaje resultante a employees.porcentaje_islr.
    upsert(declaration: AriDeclaration): Promise<Result<void>>;

    // Elimina una declaración por id.
    delete(id: string): Promise<Result<void>>;
}
