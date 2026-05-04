import { SupabaseClient } from '@supabase/supabase-js';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { ICustomerRepository } from '../../domain/repository/customer.repository';
import { Customer } from '../../domain/customer';

interface RpcRow {
    id:         string;
    empresa_id: string;
    rif:        string;
    nombre:     string;
    contacto:   string | null;
    telefono:   string | null;
    email:      string | null;
    direccion:  string | null;
    notas:      string | null;
    activo:     boolean | null;
    created_at: string | null;
    updated_at: string | null;
}

export class RpcCustomerRepository implements ICustomerRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<Customer[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_ventas_clientes_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RpcRow[]) ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch customers');
        }
    }

    async save(customer: Customer): Promise<Result<Customer>> {
        try {
            const payload = {
                id:         customer.id ?? '',
                empresa_id: customer.companyId,
                rif:        customer.rif,
                nombre:     customer.name,
                contacto:   customer.contact ?? '',
                telefono:   customer.phone ?? '',
                email:      customer.email ?? '',
                direccion:  customer.address ?? '',
                notas:      customer.notes ?? '',
                activo:     customer.active === false ? 'false' : 'true',
            };
            const { data, error } = await this.source.instance
                .rpc('tenant_ventas_cliente_save', { p_user_id: this.userId, p_cliente: payload });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as RpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to save customer');
        }
    }

    async delete(id: string): Promise<Result<{ softDeleted: boolean }>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_ventas_cliente_delete', { p_user_id: this.userId, p_id: id });
            if (error) return Result.fail(error.message);
            return Result.success({ softDeleted: Boolean((data as { soft_deleted?: boolean })?.soft_deleted) });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to delete customer');
        }
    }

    private mapToDomain(row: RpcRow): Customer {
        return {
            id:         row.id,
            companyId:  row.empresa_id,
            rif:        row.rif,
            name:       row.nombre,
            contact:    row.contacto  ?? '',
            phone:      row.telefono  ?? '',
            email:      row.email     ?? '',
            address:    row.direccion ?? '',
            notes:      row.notas     ?? '',
            active:     row.activo !== false,
            createdAt:  row.created_at ?? undefined,
            updatedAt:  row.updated_at ?? undefined,
        };
    }
}
