"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the viewport is ≥ 1280px (xl breakpoint = desktop).
 * Returns null during SSR / before hydration to avoid flash of wrong content.
 */
export function useIsDesktop(): boolean | null {
    const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

    useEffect(() => {
        const mq = window.matchMedia("(min-width: 1280px)");
        setIsDesktop(mq.matches);

        function handleChange(e: MediaQueryListEvent) {
            setIsDesktop(e.matches);
        }

        mq.addEventListener("change", handleChange);
        return () => mq.removeEventListener("change", handleChange);
    }, []);

    return isDesktop;
}
