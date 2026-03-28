// rpc-islr-report.repository.ts — Supabase RPC adapter for the ISLR Art. 177 report.
// Role: infrastructure — implements IIslrReportRepository via Postgres RPC.
// Invariant: maps raw RPC rows to domain IslrProduct; no business logic here.
import { SupabaseClient } from '@supabase/supabase-js';
import { IIslrReportRepository } from '../../domain/repository/islr-report.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { IslrProduct, IslrMovement } from '../../domain/islr-report';

// Infrastructure DTO — shape of the raw Postgres RPC row for one product.
interface IslrProductRpcRow {
  producto_id:       string | null;
  producto_codigo:   string | null;
  producto_nombre:   string | null;
  apertura_cantidad: number | null;
  apertura_costo:    number | null;
  movimientos:       IslrMovementRpcRow[] | null;
}

// Infrastructure DTO — shape of one movement inside the product row.
interface IslrMovementRpcRow {
  id:             string | null;
  fecha:          string | null;
  referencia:     string | null;
  tipo:           string | null;
  cant_entrada:   number | null;
  cant_salida:    number | null;
  saldo_cantidad: number | null;
  costo_entrada:  number | null;
  costo_salida:   number | null;
  saldo_costo:    number | null;
}

export class RpcIslrReportRepository implements IIslrReportRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getReport(companyId: string, period: string): Promise<Result<IslrProduct[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_kardex_periodo', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                    p_periodo:    period,
                });
            if (error) return Result.fail(error.message);
            return Result.success((data as IslrProductRpcRow[] ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch ISLR report');
        }
    }

    private mapToDomain(row: IslrProductRpcRow): IslrProduct {
        const movements = Array.isArray(row.movimientos) ? row.movimientos : [];
        return {
            productId:       row.producto_id      ?? '',
            productCode:     row.producto_codigo  ?? '',
            productName:     row.producto_nombre  ?? '',
            openingQuantity: Number(row.apertura_cantidad ?? 0),
            openingCost:     Number(row.apertura_costo    ?? 0),
            movements:       movements.map((m): IslrMovement => ({
                id:               m.id             ?? '',
                date:             m.fecha          ?? '',
                reference:        m.referencia     ?? '',
                type:             m.tipo           ?? '',
                inboundQuantity:  Number(m.cant_entrada   ?? 0),
                outboundQuantity: Number(m.cant_salida    ?? 0),
                balanceQuantity:  Number(m.saldo_cantidad ?? 0),
                inboundCost:      Number(m.costo_entrada  ?? 0),
                outboundCost:     Number(m.costo_salida   ?? 0),
                balanceCost:      Number(m.saldo_costo    ?? 0),
            })),
        };
    }
}
