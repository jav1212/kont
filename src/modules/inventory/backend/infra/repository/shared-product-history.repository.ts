import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import type { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { normalizeCurrencyCode } from '../../../shared/currency';
import type { ProductHistory, ProductHistoryPoint, LatestPurchase } from '../../domain/product-history';
import type { IProductHistoryRepository } from '../../domain/repository/product-history.repository';

type RawPoint = {
    kind: 'purchase' | 'sale'; date: string; currency: string | null;
    source_amount: number | string | null; ves_amount: number | string | null;
    exchange_rate: number | string | null; quantity: number | string | null;
    reference: string | null; document_id: string; created_at?: string;
};

type RawHistory = { latestPurchase: RawPoint | null; points: RawPoint[] };
const n = (value: number | string | null | undefined): number => value == null || value === '' ? 0 : Number(value);

export class SharedProductHistoryRepository implements IProductHistoryRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async find(companyId: string, productId: string): Promise<Result<ProductHistory>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_inventory_product_history', {
                p_tenant_id: this.tenantId, p_company_id: companyId, p_product_id: productId,
            });
            if (error) return Result.fail(error.message);
            const raw = data as RawHistory;
            return Result.success({
                latestPurchase: raw.latestPurchase ? this.mapLatest(raw.latestPurchase) : null,
                points: (raw.points ?? []).map((point) => this.mapPoint(point)),
            });
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch product history');
        }
    }

    private mapPoint(raw: RawPoint): ProductHistoryPoint {
        return {
            kind: raw.kind, date: raw.date, currency: normalizeCurrencyCode(raw.currency),
            sourceAmount: n(raw.source_amount), vesAmount: n(raw.ves_amount),
            exchangeRate: raw.exchange_rate == null ? null : n(raw.exchange_rate),
            quantity: n(raw.quantity), reference: raw.reference ?? '', documentId: raw.document_id,
        };
    }

    private mapLatest(raw: RawPoint): LatestPurchase {
        const { kind: _kind, ...point } = this.mapPoint({ ...raw, kind: 'purchase' });
        return point;
    }
}

export class UnsupportedProductHistoryRepository implements IProductHistoryRepository {
    async find(): Promise<Result<ProductHistory>> {
        return Result.fail('El historial de productos está disponible para el esquema compartido');
    }
}
