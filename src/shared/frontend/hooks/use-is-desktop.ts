"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the viewport is ≥ 1280px (xl breakpoint = desktop).
 * Defaults to true on SSR/hydration so layouts don't flash an empty state.
 */
export function useIsDesktop(): boolean {
    const [isDesktop, setIsDesktop] = useState<boolean>(true);

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
