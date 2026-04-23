"use client";

// ContextLink — drop-in replacement for next/link that automatically preserves
// the tid (tenant) and cid (company) query params across client-side navigations.
// Use this in all app/(app) pages instead of importing Link from "next/link".

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";

const CONTEXT_PARAMS = ["tid", "cid"] as const;

/**
 * Append current tid/cid search params to an href string.
 * Existing params on the href are preserved; context params are only added when absent.
 */
function appendContext(href: string, searchParams: URLSearchParams): string {
    // Only modify simple path strings; skip external URLs and complex objects.
    if (href.startsWith("http") || href.startsWith("//")) return href;

    const url = new URL(href, "http://n");
    for (const key of CONTEXT_PARAMS) {
        const value = searchParams.get(key);
        if (value && !url.searchParams.has(key)) {
            url.searchParams.set(key, value);
        }
    }
    return url.pathname + url.search + url.hash;
}

export function ContextLink(props: ComponentProps<typeof Link>) {
    const searchParams = useSearchParams();
    const { href, ...rest } = props;

    const resolved = typeof href === "string"
        ? appendContext(href, searchParams)
        : href;

    return <Link href={resolved} {...rest} />;
}
