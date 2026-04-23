"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { CalendarEntry } from "../data/types";
import { ObligationCard } from "./obligation-card";
import { MONTHS_ES_FULL } from "../utils/date-helpers";
import { todayLocalIso } from "../utils/date-helpers";

interface ObligationsListProps {
    entries: CalendarEntry[];
    nextEntryId?: string;
}

function groupByMonth(entries: CalendarEntry[]): Map<number, { label: string; entries: CalendarEntry[] }> {
    const map = new Map<number, { label: string; entries: CalendarEntry[] }>();
    for (const entry of entries) {
        const month = parseInt(entry.dueDate.split("-")[1], 10);
        if (!map.has(month)) {
            map.set(month, { label: MONTHS_ES_FULL[month - 1], entries: [] });
        }
        map.get(month)!.entries.push(entry);
    }
    return map;
}

export function ObligationsList({ entries, nextEntryId }: ObligationsListProps) {
    const today = todayLocalIso();
    const grouped = groupByMonth(entries);

    if (entries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <p className="text-[13px] font-mono text-text-tertiary">
                    No hay obligaciones para los filtros seleccionados.
                </p>
            </div>
        );
    }

    return (
        <div id="obligation-list-panel" role="tabpanel" className="flex flex-col gap-6">
            <AnimatePresence mode="wait">
                {Array.from(grouped.entries()).map(([month, group]) => (
                    <motion.div
                        key={month}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="flex flex-col gap-3"
                    >
                        {/* Sticky month header */}
                        <div className="sticky top-0 z-10 py-2 bg-background border-b border-border-light">
                            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
                                {group.label}
                            </span>
                        </div>

                        <div className="flex flex-col gap-2">
                            {group.entries.map((entry) => {
                                const isNext = entry.obligationId === nextEntryId && entry.dueDate >= today;
                                const isPast = entry.dueDate < today;
                                const variant = isNext ? "next" : isPast ? "past" : "upcoming";
                                return (
                                    <ObligationCard
                                        key={`${entry.obligationId}-${entry.dueDate}`}
                                        entry={entry}
                                        variant={variant}
                                    />
                                );
                            })}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
