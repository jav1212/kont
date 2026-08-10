import type { Product, SaleCurrency } from '../../backend/domain/product';
import { isLocalCurrency } from '../../shared/currency';

export interface ResolvedProductSalePrice {
    currency: SaleCurrency;
    sourcePrice: number;
    unitPriceBs: number;
}

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

export function resolveProductSalePrice(
    product: Product,
    dollarRate: number | null,
): ResolvedProductSalePrice | null {
    const pricing = product.salePricing;
    if (!pricing) return null;

    if (pricing.mode === 'fixed') {
        if (!isLocalCurrency(pricing.currency)) {
            if (!dollarRate || dollarRate <= 0) return null;
            return { currency: 'D', sourcePrice: pricing.amount, unitPriceBs: round4(pricing.amount * dollarRate) };
        }
        return { currency: 'B', sourcePrice: pricing.amount, unitPriceBs: pricing.amount };
    }

    const unitPriceBs = round4(product.averageCost * (1 + pricing.percentage / 100));
    if (!isLocalCurrency(pricing.currency)) {
        if (!dollarRate || dollarRate <= 0) return null;
        return { currency: 'D', sourcePrice: round4(unitPriceBs / dollarRate), unitPriceBs };
    }
    return { currency: 'B', sourcePrice: unitPriceBs, unitPriceBs };
}
