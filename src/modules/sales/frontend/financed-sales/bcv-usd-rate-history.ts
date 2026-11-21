// Browser adapter for the official USD rate history consumed by the
// financed-sales exchange-difference report.

import { exactDecimal } from "@kontave/monetary/domain";
import { salesDate, type SalesDate } from "@kontave/sales/domain";
import type { UsdVesRateHistory, UsdVesRatePoint } from "@kontave/sales/application";

interface RangeResponse {
    points?: Array<{ date: string; sell: number }>;
    error?: string;
}

/**
 * Reads USD rates from `/api/bcv/range` and keeps the widest range fetched so
 * far, so recalculating after an edit does not hit the BCV proxy again.
 */
export class BcvUsdRateHistory implements UsdVesRateHistory {
    private cached: { start: SalesDate; end: SalesDate; points: readonly UsdVesRatePoint[] } | null = null;

    /** {@inheritDoc UsdVesRateHistory.ratesBetween} */
    async ratesBetween(start: SalesDate, end: SalesDate): Promise<readonly UsdVesRatePoint[]> {
        const cached = this.cached;
        if (cached && cached.start <= start && cached.end >= end) {
            return cached.points.filter((point) => point.effectiveDate >= start && point.effectiveDate <= end);
        }
        const response = await fetch(`/api/bcv/range?code=USD&start=${start}&end=${end}`);
        const body = (await response.json().catch(() => ({}))) as RangeResponse;
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        const points = (body.points ?? []).map((point) => ({
            effectiveDate: salesDate(point.date),
            // BCV publishes up to 8 decimals; String() keeps them without float noise for these magnitudes.
            vesPerUsd: exactDecimal(String(point.sell)),
        }));
        this.cached = { start, end, points };
        return points;
    }
}
