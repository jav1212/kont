"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { trackEvent } from "./analytics-consent";

const AUTH_ROUTES = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/accept-invite", "/resend-confirmation"];

export function MobileCta() {
    const pathname = usePathname() ?? "/";
    if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-default bg-background/90 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(8,9,16,0.12)] backdrop-blur-md md:hidden">
            <Link
                href="/sign-up"
                onClick={() => trackEvent("mobile_cta_click", { location: pathname })}
                className="flex h-11 items-center justify-center rounded-full bg-primary-500 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-white shadow-sm shadow-primary-500/30 hover:bg-primary-600"
            >
                Comenzar gratis
            </Link>
        </div>
    );
}
