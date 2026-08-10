import type { CurrencyCode } from '../../shared/currency';

export type ProductHistoryKind = 'purchase' | 'sale';

export interface ProductHistoryPoint {
    kind: ProductHistoryKind;
    date: string;
    currency: CurrencyCode;
    sourceAmount: number;
    vesAmount: number;
    exchangeRate: number | null;
    quantity: number;
    reference: string;
    documentId: string;
}

export type LatestPurchase = Omit<ProductHistoryPoint, 'kind'>;

export interface ProductHistory {
    latestPurchase: LatestPurchase | null;
    points: ProductHistoryPoint[];
}
