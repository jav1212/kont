"use client";

// use-url-context — reads tenant (tid) and company (cid) query params from the
// current URL and provides helpers to build context-aware hrefs.
// This is the single source of truth for URL-based context params.
// localStorage remains the fallback when params are absent.

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

const TID_PARAM = "tid";
const CID_PARAM = "cid";

export interface UrlContext {
    /** Tenant ID from URL search params, or null if absent. */
    urlTenantId: string | null;
    /** Company ID from URL search params, or null if absent. */
    urlCompanyId: string | null;
    /** Build an href that preserves current tid/cid (with optional overrides). */
    buildContextHref: (path: string, overrides?: { tid?: string | null; cid?: string | null }) => string;
    /** Replace the current URL's tid/cid params without adding a history entry. */
    buildReplaceUrl: (overrides: { tid?: string | null; cid?: string | null }) => string;
}

export function useUrlContext(): UrlContext {
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const urlTenantId = searchParams.get(TID_PARAM);
    const urlCompanyId = searchParams.get(CID_PARAM);

    const buildContextHref = useCallback(
        (path: string, overrides?: { tid?: string | null; cid?: string | null }) => {
            const tid = overrides?.tid !== undefined ? overrides.tid : urlTenantId;
            const cid = overrides?.cid !== undefined ? overrides.cid : urlCompanyId;

            const url = new URL(path, "http://localhost");
            if (tid) url.searchParams.set(TID_PARAM, tid);
            if (cid) url.searchParams.set(CID_PARAM, cid);

            // Return pathname + search (no origin)
            return url.pathname + url.search;
        },
        [urlTenantId, urlCompanyId],
    );

    const buildReplaceUrl = useCallback(
        (overrides: { tid?: string | null; cid?: string | null }) => {
            const tid = overrides.tid !== undefined ? overrides.tid : urlTenantId;
            const cid = overrides.cid !== undefined ? overrides.cid : urlCompanyId;

            const params = new URLSearchParams();
            if (tid) params.set(TID_PARAM, tid);
            if (cid) params.set(CID_PARAM, cid);

            const qs = params.toString();
            return qs ? `${pathname}?${qs}` : pathname;
        },
        [pathname, urlTenantId, urlCompanyId],
    );

    return { urlTenantId, urlCompanyId, buildContextHref, buildReplaceUrl };
}

// ── useContextRouter ─────────────────────────────────────────────────────────
// Drop-in wrapper around Next.js useRouter that auto-preserves tid/cid params
// on push() and replace(). Use in app/(app) pages instead of useRouter directly.

interface ContextRouter {
    push: (href: string) => void;
    replace: (href: string) => void;
    back: () => void;
    forward: () => void;
    refresh: () => void;
    prefetch: (href: string) => void;
}

export function useContextRouter(): ContextRouter {
    const router = useRouter();
    const searchParams = useSearchParams();

    const inject = useCallback(
        (href: string): string => {
            if (href.startsWith("http") || href.startsWith("//")) return href;
            const url = new URL(href, "http://n");
            for (const key of [TID_PARAM, CID_PARAM]) {
                const value = searchParams.get(key);
                if (value && !url.searchParams.has(key)) {
                    url.searchParams.set(key, value);
                }
            }
            return url.pathname + url.search + url.hash;
        },
        [searchParams],
    );

    return useMemo(
        () => ({
            push: (href: string) => router.push(inject(href)),
            replace: (href: string) => router.replace(inject(href)),
            back: () => router.back(),
            forward: () => router.forward(),
            refresh: () => router.refresh(),
            prefetch: (href: string) => router.prefetch(inject(href)),
        }),
        [router, inject],
    );
}
