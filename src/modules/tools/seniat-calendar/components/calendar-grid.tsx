"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { CalendarEntry } from "../data/types";
import { ObligationCard } from "./obligation-card";
import { MONTHS_ES_FULL } from "../utils/date-helpers";
import { getMostCriticalCategory, CATEGORY_STYLES } from "../utils/category-colors";
import { BaseAccordion, accordionItemProps } from "@/src/shared/frontend/components/base-accordion";
import { todayLocalIso } from "../utils/date-helpers";
import { exportAsPng } from "../utils/image-exporter";

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

// Builds a readable tooltip label for a day's entries
function buildDayTooltip(day: number, entries: CalendarEntry[]): string {
    const titles = entries.map((e) => e.shortTitle).join(", ");
    return `Día ${day}: ${titles}`;
}

interface MonthCardProps {
    month: number;
    monthEntries: CalendarEntry[];
    nextDueDate: string | null;
    year: number;
}

function MonthCard({ month, monthEntries, nextDueDate, year }: MonthCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [exportingPng, setExportingPng] = useState(false);
    const today = todayLocalIso();
    const currentMonth = new Date().getMonth() + 1;
    const currentYear  = new Date().getFullYear();
    const isCurrentMonth = month === currentMonth && year === currentYear;
    const isAllPast = monthEntries.length > 0 && monthEntries.every((e) => e.dueDate < today);
    const monthSlug = MONTHS_ES_FULL[month - 1].toLowerCase();

    async function handleExportMonthPng(e: React.MouseEvent) {
        e.stopPropagation();
        if (exportingPng) return;
        setExportingPng(true);
        try {
            await exportAsPng(
                `month-card-${month}-${year}`,
                `calendario-seniat-${year}-${monthSlug}`,
                { pixelRatio: 2, backgroundColor: "#FFFFFF" }
            );
            toast.success(`Imagen de ${MONTHS_ES_FULL[month - 1]} descargada`);
        } catch {
            toast.error("Error al generar la imagen");
        } finally {
            setExportingPng(false);
        }
    }

    const byDay = new Map<number, CalendarEntry[]>();
    for (const entry of monthEntries) {
        const d = parseInt(entry.dueDate.split("-")[2], 10);
        const arr = byDay.get(d) ?? [];
        arr.push(entry);
        byDay.set(d, arr);
    }
    const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);

    const hasNext = monthEntries.some((e) => e.dueDate === nextDueDate);

    return (
        <div
            id={`month-card-${month}-${year}`}
            className={[
                "rounded-2xl border overflow-hidden flex flex-col bg-surface-1",
                "transition-[border-color,box-shadow,transform] duration-200",
                expanded
                    ? "border-primary-400 shadow-[var(--shadow-md)]"
                    : isCurrentMonth
                    ? "border-primary-400/50 hover:border-primary-400/80 hover:shadow-[var(--shadow-sm)] cursor-pointer"
                    : isAllPast
                    ? "border-border-light opacity-70 hover:opacity-90 cursor-pointer"
                    : "border-border-light hover:border-border-default hover:shadow-[var(--shadow-sm)] cursor-pointer",
            ].join(" ")}
        >
            {/* Current month accent line */}
            {isCurrentMonth && (
                <div className="h-0.5 bg-primary-500 flex-shrink-0" aria-hidden />
            )}

            {/* Month header */}
            <button
                className={[
                    "flex items-center justify-between px-4 py-3 border-b w-full text-left",
                    "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset",
                    expanded
                        ? "bg-surface-2 border-primary-400/25"
                        : "bg-surface-2 border-border-light hover:bg-surface-3",
                ].join(" ")}
                onClick={() => setExpanded((v) => !v)}
                aria-label={`${MONTHS_ES_FULL[month - 1]} ${year} — ${monthEntries.length} obligación${monthEntries.length !== 1 ? "es" : ""}. Pulsa para ${expanded ? "contraer" : "expandir"}`}
                aria-expanded={expanded}
                aria-controls={`month-panel-${month}`}
            >
                <div className="flex items-center gap-2">
                    <span
                        className={[
                            "text-[12px] font-mono font-bold uppercase tracking-[0.14em]",
                            expanded || isCurrentMonth ? "text-text-primary" : "text-text-secondary",
                        ].join(" ")}
                    >
                        {MONTHS_ES_FULL[month - 1]}
                    </span>
                    {isCurrentMonth && (
                        <span className="h-4 px-1.5 rounded-full bg-primary-500 text-white text-[9px] font-mono uppercase tracking-[0.1em] inline-flex items-center">
                            este mes
                        </span>
                    )}
                    {hasNext && !isCurrentMonth && (
                        <span className="h-4 px-1.5 rounded-full bg-badge-warning-bg border border-badge-warning-border text-text-warning text-[9px] font-mono uppercase tracking-[0.1em] inline-flex items-center">
                            proximo
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <span
                        className={[
                            "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-mono font-bold tabular-nums",
                            expanded
                                ? "bg-primary-500 text-white"
                                : monthEntries.length === 0
                                ? "bg-surface-3 text-text-disabled"
                                : "bg-primary-100 text-primary-600 dark:bg-primary-50/10 dark:text-primary-400",
                        ].join(" ")}
                    >
                        {monthEntries.length}
                    </span>
                    <motion.span
                        animate={{ rotate: expanded ? 180 : 0 }}
                        transition={{ type: "spring", stiffness: 220, damping: 20 }}
                        className="inline-flex text-text-tertiary"
                        aria-hidden
                    >
                        <ChevronDown size={14} />
                    </motion.span>
                </div>
            </button>

            {/* Mini-bars (collapsed state) */}
            {!expanded && (
                <div className="px-4 py-3.5 flex flex-col gap-2 flex-1 min-h-[140px]">
                    {monthEntries.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-[11px] font-mono text-text-disabled italic">
                                Sin obligaciones
                            </p>
                        </div>
                    ) : (
                        <>
                            {sortedDays.slice(0, 7).map((day) => {
                                const dayEntries = byDay.get(day) ?? [];
                                const critCat = getMostCriticalCategory(dayEntries.map((e) => e.category));
                                const catStyle = CATEGORY_STYLES[critCat];
                                const dateIso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                const isPast = dateIso < today;
                                const isNext = dateIso === nextDueDate;
                                const tooltip = buildDayTooltip(day, dayEntries);
                                return (
                                    <div
                                        key={day}
                                        className="group flex items-center gap-2.5"
                                        title={tooltip}
                                        aria-label={tooltip}
                                    >
                                        <span
                                            className={[
                                                "text-[11px] font-mono tabular-nums w-6 flex-shrink-0 text-right",
                                                isPast ? "text-text-disabled" : "text-text-tertiary",
                                            ].join(" ")}
                                        >
                                            {day}
                                        </span>
                                        <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-surface-3">
                                            <div
                                                className={[
                                                    "h-full rounded-full transition-opacity duration-150",
                                                    isNext ? "opacity-100" : isPast ? "opacity-35" : "opacity-85 group-hover:opacity-100",
                                                ].join(" ")}
                                                style={{
                                                    backgroundColor: isPast
                                                        ? "var(--border-default)"
                                                        : catStyle.barColor,
                                                    width: "100%",
                                                }}
                                            />
                                        </div>
                                        <div className="flex items-center gap-1.5 w-12 flex-shrink-0 justify-end">
                                            {/* Category dots (up to 3) */}
                                            <div className="flex gap-0.5">
                                                {dayEntries.slice(0, 3).map((e, idx) => {
                                                    const s = CATEGORY_STYLES[e.category];
                                                    return (
                                                        <span
                                                            key={idx}
                                                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                                            style={{
                                                                backgroundColor: isPast
                                                                    ? "var(--border-default)"
                                                                    : s.barColor,
                                                                opacity: isPast ? 0.4 : 1,
                                                            }}
                                                            aria-hidden
                                                        />
                                                    );
                                                })}
                                            </div>
                                            {dayEntries.length > 3 && (
                                                <span className="text-[9px] font-mono text-text-disabled">
                                                    +{dayEntries.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {sortedDays.length > 7 && (
                                <p className="text-[10px] font-mono text-text-tertiary mt-0.5">
                                    +{sortedDays.length - 7} fechas más
                                </p>
                            )}
                        </>
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
                                <p className="text-[12px] font-mono text-text-tertiary py-3 text-center">
                                    Sin obligaciones este mes
                                </p>
                            ) : (
                                <>
                                    {monthEntries.map((entry) => {
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
                                    })}
                                    <button
                                        type="button"
                                        onClick={handleExportMonthPng}
                                        disabled={exportingPng}
                                        data-export-exclude="true"
                                        className="mt-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border-light bg-surface-2 text-[11px] font-mono text-text-secondary uppercase tracking-[0.1em] hover:bg-surface-3 hover:text-text-primary hover:border-border-default transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-wait"
                                        aria-label={`Descargar ${MONTHS_ES_FULL[month - 1]} como imagen PNG`}
                                    >
                                        <ImageIcon size={12} strokeWidth={1.5} aria-hidden />
                                        {exportingPng ? "Exportando..." : "Descargar mes (PNG)"}
                                    </button>
                                </>
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
    const accordionDefaultExpanded = [`month-${new Date().getMonth() + 1}`];

    return (
        <>
            {/* Desktop / Tablet grid — accordion on <md, 2col md, 3col xl */}
            <div
                id="calendar-grid-panel"
                role="tabpanel"
                className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 gap-5"
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
            <div className="block md:hidden" id="calendar-grid-panel-mobile" role="tabpanel">
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
                                    <p className="text-[12px] font-mono text-foreground/40 py-2 text-center">
                                        Sin obligaciones este mes
                                    </p>
                                ) : (
                                    monthEntries.map((entry) => {
                                        const isNext = entry.dueDate === nextEntryDueDate;
                                        const today = todayLocalIso();
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
