"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type TreasuryFilterState = Readonly<Record<string, string>>;

/** Synchronizes Treasury list filters with query parameters so links and browser history retain context.
 * @param defaults - Allowed filter keys and their empty/default values.
 * @returns Current filter state and a patch function that updates the URL.
 */
export function useTreasuryFilters<T extends TreasuryFilterState>(defaults: T): {
  readonly filters: T;
  readonly setFilters: (patch: Partial<T>, mode?: "push" | "replace") => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const encodedDefaults = JSON.stringify(defaults);
  const filters = useMemo(() => {
    const base = JSON.parse(encodedDefaults) as T;
    const result = { ...base };
    for (const key of Object.keys(base)) {
      const value = searchParams.get(key);
      if (value !== null) result[key as keyof T] = value as T[keyof T];
    }
    return result;
  }, [encodedDefaults, searchParams]);
  const setFilters = useCallback((patch: Partial<T>, mode: "push" | "replace" = "push") => {
    const params = new URLSearchParams(searchParams.toString());
    const changedFilter = Object.keys(patch).some((key) => key !== "page");
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, String(value));
    }
    if (changedFilter) params.delete("page");
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    if (mode === "replace") router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [pathname, router, searchParams]);
  return { filters, setFilters };
}
