"use client";

import { useEffect, useState } from "react";
import type { CalendarEntry } from "../data/types";
import { daysBetween, todayLocalIso } from "../utils/date-helpers";

export type CountdownSeverity = "urgent" | "warning" | "normal" | "none";

export interface CountdownState {
    entry: CalendarEntry | null;
    days: number;
    severity: CountdownSeverity;
}

function computeCountdown(entries: CalendarEntry[], todayIso: string): CountdownState {
    const upcoming = entries.filter((e) => e.dueDate >= todayIso);
    if (upcoming.length === 0) return { entry: null, days: 0, severity: "none" };

    const next = upcoming[0];
    const days = daysBetween(todayIso, next.dueDate);

    let severity: CountdownSeverity = "normal";
    if (days <= 3) severity = "urgent";
    else if (days <= 7) severity = "warning";

    return { entry: next, days, severity };
}

/**
 * Returns the countdown to the next upcoming obligation.
 * Updates every 60 seconds (checking for day changes).
 */
export function useCountdown(entries: CalendarEntry[]): CountdownState {
    const [state, setState] = useState<CountdownState>(() =>
        computeCountdown(entries, todayLocalIso())
    );

    // Recompute when entries change
    useEffect(() => {
        setState(computeCountdown(entries, todayLocalIso()));
    }, [entries]);

    // Update every 60 seconds in case the day rolls over
    useEffect(() => {
        const interval = setInterval(() => {
            setState(computeCountdown(entries, todayLocalIso()));
        }, 60_000);
        return () => clearInterval(interval);
    }, [entries]);

    return state;
}
