// rpc-supplier.repository.ts — Supabase RPC adapter for the Supplier entity.
// Role: infrastructure — implements ISupplierRepository via Postgres RPC.
// Invariant: all DB RPC function names are unchanged (DB contract).
import { SupabaseClient } from '@supabase/supabase-js';
import { ISupplierRepository } from '../../domain/repository/supplier.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { Supplier } from '../../domain/supplier';

// Infrastructure DTO — shape of the raw Postgres RPC row returned by tenant_inventario_proveedores_get.
interface SupplierRpcRow {
  id: string | null;
  empresa_id: string;
  rif: string | null;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export class RpcSupplierRepository implements ISupplierRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByCompany(companyId: string): Promise<Result<Supplier[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_proveedores_get', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as SupplierRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch suppliers');
        }
    }

    async upsert(supplier: Supplier): Promise<Result<Supplier>> {
        try {
            const row = {
                id:         supplier.id ?? '',
                empresa_id: supplier.companyId,
                rif:        supplier.rif,
                nombre:     supplier.name,
                contacto:   supplier.contact,
                telefono:   supplier.phone,
                email:      supplier.email,
                direccion:  supplier.address,
                notas:      supplier.notes,
                activo:     supplier.active,
            };
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_proveedores_upsert', {
                    p_user_id: this.userId,
                    p_row:     row,
                });
            if (error) return Result.fail(error.message);
            return Result.success(this.mapToDomain(data as SupplierRpcRow));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to save supplier');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_inventario_proveedores_delete', {
                    p_user_id: this.userId,
                    p_id:      id,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to delete supplier');
        }
    }

    private mapToDomain(row: SupplierRpcRow): Supplier {
        return {
            id:        row.id ?? undefined,
            companyId: row.empresa_id,
            rif:       row.rif ?? '',
            name:      row.nombre,
            contact:   row.contacto ?? '',
            phone:     row.telefono ?? '',
            email:     row.email ?? '',
            address:   row.direccion ?? '',
            notes:     row.notas ?? '',
            active:    Boolean(row.activo ?? true),
            createdAt: row.created_at ?? undefined,
            updatedAt: row.updated_at ?? undefined,
        };
    }
}
