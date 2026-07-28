// src/modules/payroll/backend/infrastructure/repository/rpc-ari-declaration.repository.ts
//
// Infraestructura — implementación Supabase RPC de IAriDeclarationRepository.
// Lee/escribe la tabla ari_declarations del tenant vía las RPCs definidas en
// la migración 118_payroll_ari_declarations.sql.

import { SupabaseClient }              from '@supabase/supabase-js';
import { IAriDeclarationRepository }   from '../../domain/repository/ari-declaration.repository';
import { ISource }                     from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result }                      from '@/src/core/domain/result';
import { AriDeclaration }              from '../../domain/ari-declaration';

// Fila cruda devuelta por las RPCs tenant_ari_* — nunca se exporta fuera de este archivo.
interface RawAriRow {
    id:                         string;
    company_id:                 string;
    employee_id:                string;
    employee_cedula:            string;
    anio_gravable:              number;
    trimestre_gravable:         number;
    valor_ut:                   number;
    remuneracion_trimestral:    number;
    usar_desgravamen_unico:     boolean;
    desg_educacion:             number;
    desg_seguros:               number;
    desg_medicos:               number;
    desg_intereses:             number;
    cargas_familiares:          number;
    impuestos_retenidos_de_mas: number;
    porcentaje_retencion:       number;
    updated_at:                 string;
}

export class RpcAriDeclarationRepository implements IAriDeclarationRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<AriDeclaration[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_ari_get_by_company', {
                    p_user_id:    this.userId,
                    p_company_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawAriRow[]) ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al cargar declaraciones AR-I');
        }
    }

    async upsert(declaration: AriDeclaration): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_ari_upsert', {
                    p_user_id:     this.userId,
                    p_declaration: this.toRpc(declaration),
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al guardar la declaración AR-I');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_ari_delete', { p_user_id: this.userId, p_id: id });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al eliminar la declaración AR-I');
        }
    }

    private mapToDomain(row: RawAriRow): AriDeclaration {
        return {
            id:                      row.id,
            companyId:               row.company_id,
            employeeId:              row.employee_id,
            employeeCedula:          row.employee_cedula,
            anioGravable:            Number(row.anio_gravable),
            trimestreGravable:       Number(row.trimestre_gravable) as 1 | 2 | 3 | 4,
            valorUT:                 Number(row.valor_ut),
            remuneracionTrimestral:  Number(row.remuneracion_trimestral),
            usarDesgravamenUnico:    row.usar_desgravamen_unico,
            desgEducacion:           Number(row.desg_educacion),
            desgSeguros:             Number(row.desg_seguros),
            desgMedicos:             Number(row.desg_medicos),
            desgIntereses:           Number(row.desg_intereses),
            cargasFamiliares:        Number(row.cargas_familiares),
            impuestosRetenidosDeMas: Number(row.impuestos_retenidos_de_mas),
            porcentajeRetencion:     Number(row.porcentaje_retencion),
            updatedAt:               row.updated_at,
        };
    }

    private toRpc(d: AriDeclaration): Record<string, unknown> {
        return {
            id:                         d.id ?? '',
            company_id:                 d.companyId,
            employee_id:                d.employeeId,
            employee_cedula:            d.employeeCedula,
            anio_gravable:              d.anioGravable,
            trimestre_gravable:         d.trimestreGravable,
            valor_ut:                   d.valorUT,
            remuneracion_trimestral:    d.remuneracionTrimestral,
            usar_desgravamen_unico:     d.usarDesgravamenUnico,
            desg_educacion:             d.desgEducacion,
            desg_seguros:               d.desgSeguros,
            desg_medicos:               d.desgMedicos,
            desg_intereses:             d.desgIntereses,
            cargas_familiares:          d.cargasFamiliares,
            impuestos_retenidos_de_mas: d.impuestosRetenidosDeMas,
            porcentaje_retencion:       d.porcentajeRetencion,
        };
    }
}
