"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ObligationCategory, TaxpayerType } from "../data/types";
import { validateRif, extractLastDigit, formatRifMask } from "../utils/rif";
import { buildCalendar, AVAILABLE_YEARS } from "../utils/calendar-builder";
import { buildShareParams, parseShareParams } from "../utils/share-url";

const DEFAULT_YEAR = 2026;
const DEFAULT_TYPE: TaxpayerType = "ordinario";
const DEFAULT_VIEW: "grid" | "lista" = "grid";

export interface CalendarFilters {
    categories: ObligationCategory[];
}

export interface UseSeniatCalendarState {
    rif: string;
    setRif: (v: string) => void;
    rifFormatted: string;
    rifValid: boolean;
    rifTouched: boolean;

    taxpayerType: TaxpayerType;
    setTaxpayerType: (v: TaxpayerType) => void;

    year: number;
    setYear: (v: number) => void;
    availableYears: number[];

    view: "grid" | "lista";
    setView: (v: "grid" | "lista") => void;

    filters: CalendarFilters;
    setFilters: (f: CalendarFilters) => void;

    entries: ReturnType<typeof buildCalendar>;
    lastDigit: number | null;
}

export function useSeniatCalendar(): UseSeniatCalendarState {
    const searchParams = useSearchParams();

    // Lazily initialize from URL params
    const [rif, setRifRaw] = useState<string>(() => {
        const parsed = parseShareParams(searchParams ?? new URLSearchParams());
        return parsed.rif ?? "";
    });
    const [taxpayerType, setTaxpayerType] = useState<TaxpayerType>(() => {
        const parsed = parseShareParams(searchParams ?? new URLSearchParams());
        return parsed.tipo ?? DEFAULT_TYPE;
    });
    const [year, setYear] = useState<number>(() => {
        const parsed = parseShareParams(searchParams ?? new URLSearchParams());
        return parsed.year ?? DEFAULT_YEAR;
    });
    const [view, setView] = useState<"grid" | "lista">(() => {
        const parsed = parseShareParams(searchParams ?? new URLSearchParams());
        return parsed.view ?? DEFAULT_VIEW;
    });
    const [filters, setFilters] = useState<CalendarFilters>(() => {
        const parsed = parseShareParams(searchParams ?? new URLSearchParams());
        return { categories: parsed.cats ?? [] };
    });
    const [rifTouched, setRifTouched] = useState(false);

    // Derived values
    const rifValid = useMemo(() => validateRif(rif), [rif]);
    const rifFormatted = useMemo(() => formatRifMask(rif), [rif]);
    const lastDigit = useMemo(() => (rifValid ? extractLastDigit(rif) : null), [rif, rifValid]);

    // Calendar entries
    const entries = useMemo(() => {
        if (!rifValid || lastDigit === null) return [];
        return buildCalendar({
            year,
            lastDigit,
            taxpayerType,
            categoryFilter: filters.categories.length > 0 ? filters.categories : undefined,
        });
    }, [rifValid, lastDigit, year, taxpayerType, filters.categories]);

    // URL sync — debounced with replaceState (no router re-render)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            if (typeof window === "undefined") return;
            const params = buildShareParams({
                rif: rifValid ? rif : undefined,
                tipo: taxpayerType,
                year,
                view,
                cats: filters.categories,
            });
            const newUrl = params
                ? `${window.location.pathname}?${params}`
                : window.location.pathname;
            window.history.replaceState(null, "", newUrl);
        }, 250);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [rif, rifValid, taxpayerType, year, view, filters.categories]);

    const setRif = useCallback((v: string) => {
        setRifTouched(true);
        setRifRaw(v);
    }, []);

    return {
        rif,
        setRif,
        rifFormatted,
        rifValid,
        rifTouched,
        taxpayerType,
        setTaxpayerType,
        year,
        setYear,
        availableYears: AVAILABLE_YEARS,
        view,
        setView,
        filters,
        setFilters,
        entries,
        lastDigit,
    };
}
