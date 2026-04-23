// ============================================================================
// Share URL — build and parse URL query params for the calendar state
// ============================================================================

import type { TaxpayerType, ObligationCategory } from "../data/types";

export interface ShareParams {
    rif: string;
    tipo: TaxpayerType;
    year: number;
    view: "grid" | "lista";
    cats: ObligationCategory[];
}

/**
 * Builds a URLSearchParams string from calendar state.
 * Only includes non-default values.
 */
export function buildShareParams(params: Partial<ShareParams>): string {
    const sp = new URLSearchParams();

    if (params.rif) sp.set("rif", params.rif);
    if (params.tipo && params.tipo !== "ordinario") sp.set("tipo", params.tipo);
    if (params.year) sp.set("year", String(params.year));
    if (params.view && params.view !== "grid") sp.set("view", params.view);
    if (params.cats && params.cats.length > 0) sp.set("cats", params.cats.join(","));

    return sp.toString();
}

/**
 * Parses URLSearchParams into calendar state.
 */
export function parseShareParams(searchParams: URLSearchParams): Partial<ShareParams> {
    const result: Partial<ShareParams> = {};

    const rif = searchParams.get("rif");
    if (rif) result.rif = rif;

    const tipo = searchParams.get("tipo");
    if (tipo === "especial" || tipo === "ordinario") result.tipo = tipo;

    const year = searchParams.get("year");
    if (year) {
        const y = parseInt(year, 10);
        if (!isNaN(y) && y >= 2025 && y <= 2030) result.year = y;
    }

    const view = searchParams.get("view");
    if (view === "lista" || view === "grid") result.view = view;

    const cats = searchParams.get("cats");
    if (cats) {
        const validCats: ObligationCategory[] = [
            "IVA", "ISLR_RETENCIONES", "ISLR_ANUAL", "ISLR_ESTIMADA",
            "IGTF", "LOCTI", "RETENCIONES_ISLR_TERCEROS", "OTROS",
        ];
        const parsed = cats.split(",").filter((c) =>
            validCats.includes(c as ObligationCategory)
        ) as ObligationCategory[];
        if (parsed.length > 0) result.cats = parsed;
    }

    return result;
}
