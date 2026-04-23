"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CalendarEntry } from "../data/types";
import { ObligationCard } from "./obligation-card";
import { MONTHS_ES_FULL } from "../utils/date-helpers";
import { getMostCriticalCategory, CATEGORY_STYLES } from "../utils/category-colors";
import { BaseAccordion, accordionItemProps } from "@/src/shared/frontend/components/base-accordion";
import { todayLocalIso } from "../utils/date-helpers";

function groupByMonth(entries: CalendarEntry[]): Map<number, CalendarEntry[]> {
    const map = new Map<number, CalendarEntry[]>();
    for (let m = 1; m <= 12; m++) map.set(m, []);
    for (const entry of entries) {
        const m = parseInt(entry.dueDate.split("-")[1], 10);
        const arr = map.get(m);
        if (arr) arr.push(entry);
    }
    return map;
}

interface MonthCardProps {
    month: number;
    monthEntries: CalendarEntry[];
    nextDueDate: string | null;
    year: number;
}

function MonthCard({ month, monthEntries, nextDueDate, year }: MonthCardProps) {
    const [expanded, setExpanded] = useState(false);
    const today = todayLocalIso();

    // Group entries by day for mini-bars
    const byDay = new Map<number, CalendarEntry[]>();
    for (const entry of monthEntries) {
        const d = parseInt(entry.dueDate.split("-")[2], 10);
        const arr = byDay.get(d) ?? [];
        arr.push(entry);
        byDay.set(d, arr);
    }

    const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);

    return (
        <div
            className={[
                "rounded-xl border overflow-hidden transition-all duration-200",
                expanded
                    ? "border-primary-500 shadow-lg"
                    : "border-border-light bg-surface-1 cursor-pointer hover:border-border-medium hover:shadow-md",
            ].join(" ")}
        >
            {/* Month header */}
            <button
                className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-border-light w-full text-left"
                onClick={() => setExpanded((v) => !v)}
                aria-label={`${MONTHS_ES_FULL[month - 1]} ${year} — ${monthEntries.length} obligaciones. Pulsa para ${expanded ? "contraer" : "expandir"}`}
                aria-expanded={expanded}
                aria-controls={`month-panel-${month}`}
            >
                <span className="text-[13px] font-sans font-semibold text-text-primary uppercase tracking-[0.06em]">
                    {MONTHS_ES_FULL[month - 1]}
                </span>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 text-primary-600 text-[10px] font-mono font-bold dark:bg-primary-50/10 dark:text-primary-500">
                    {monthEntries.length}
                </span>
            </button>

            {/* Mini-bars */}
            {!expanded && monthEntries.length > 0 && (
                <div className="px-4 py-3 flex flex-col gap-1.5">
                    {sortedDays.slice(0, 5).map((day) => {
                        const dayEntries = byDay.get(day) ?? [];
                        const critCat = getMostCriticalCategory(dayEntries.map((e) => e.category));
                        const catStyle = CATEGORY_STYLES[critCat];
                        return (
                            <div key={day} className="flex items-center gap-2">
                                <span className="text-[10px] font-mono tabular-nums text-text-tertiary w-7 flex-shrink-0">
                                    {day}
                                </span>
                                <div
                                    className="flex-1 h-1.5 rounded-full"
                                    style={{ backgroundColor: catStyle.barColor }}
                                />
                                <span className="text-[10px] font-mono text-text-disabled ml-1">
                                    {dayEntries.length}
                                </span>
                            </div>
                        );
                    })}
                    {sortedDays.length > 5 && (
                        <p className="text-[10px] font-mono text-text-disabled mt-0.5">
                            +{sortedDays.length - 5} más...
                        </p>
                    )}
                    {monthEntries.length === 0 && (
                        <p className="text-[11px] font-mono text-text-disabled italic">Sin obligaciones</p>
                    )}
                </div>
            )}

            {/* Expanded panel */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        id={`month-panel-${month}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 py-3 flex flex-col gap-2 bg-surface-1">
                            {monthEntries.length === 0 ? (
                                <p className="text-[12px] font-mono text-text-tertiary py-2 text-center">
                                    Sin obligaciones este mes
                                </p>
                            ) : (
                                monthEntries.map((entry) => {
                                    const isNext = entry.dueDate === nextDueDate;
                                    const isPast = entry.dueDate < today;
                                    const variant = isNext ? "next" : isPast ? "past" : "upcoming";
                                    return (
                                        <ObligationCard
                                            key={`${entry.obligationId}-${entry.dueDate}`}
                                            entry={entry}
                                            variant={variant}
                                            compact
                                        />
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

interface CalendarGridProps {
    entries: CalendarEntry[];
    year: number;
    nextEntryDueDate: string | null;
}

export function CalendarGrid({ entries, year, nextEntryDueDate }: CalendarGridProps) {
    const byMonth = groupByMonth(entries);
    const today = todayLocalIso();
    const currentMonth = new Date().getMonth() + 1;

    // Mobile accordion
    const isMobileClass = "block sm:hidden";
    const isDesktopClass = "hidden sm:grid";

    const accordionDefaultExpanded = [`month-${currentMonth}`];

    return (
        <>
            {/* Desktop / Tablet grid */}
            <div
                id="calendar-grid-panel"
                role="tabpanel"
                className={`${isDesktopClass} grid-cols-2 lg:grid-cols-3 gap-4`}
            >
                {Array.from(byMonth.entries()).map(([month, monthEntries]) => (
                    <MonthCard
                        key={month}
                        month={month}
                        monthEntries={monthEntries}
                        nextDueDate={nextEntryDueDate}
                        year={year}
                    />
                ))}
            </div>

            {/* Mobile accordion */}
            <div className={`${isMobileClass}`} id="calendar-grid-panel-mobile" role="tabpanel">
                <BaseAccordion.Root
                    selectionMode="single"
                    defaultExpandedKeys={accordionDefaultExpanded}
                    className="flex flex-col gap-2"
                >
                    {Array.from(byMonth.entries()).map(([month, monthEntries]) => (
                        <BaseAccordion.Item
                            key={`month-${month}`}
                            {...accordionItemProps({
                                title: `${MONTHS_ES_FULL[month - 1]} — ${monthEntries.length} obligación${monthEntries.length !== 1 ? "es" : ""}`,
                            })}
                        >
                            <div className="flex flex-col gap-2 pt-1">
                                {monthEntries.length === 0 ? (
                                    <p className="text-[12px] font-mono text-text-tertiary py-2 text-center">
                                        Sin obligaciones este mes
                                    </p>
                                ) : (
                                    monthEntries.map((entry) => {
                                        const isNext = entry.dueDate === nextEntryDueDate;
                                        const isPast = entry.dueDate < today;
                                        const variant = isNext ? "next" : isPast ? "past" : "upcoming";
                                        return (
                                            <ObligationCard
                                                key={`${entry.obligationId}-${entry.dueDate}`}
                                                entry={entry}
                                                variant={variant}
                                                compact
                                            />
                                        );
                                    })
                                )}
                            </div>
                        </BaseAccordion.Item>
                    ))}
                </BaseAccordion.Root>
            </div>
        </>
    );
}
