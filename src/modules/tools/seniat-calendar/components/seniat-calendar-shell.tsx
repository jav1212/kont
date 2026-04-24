"use client";

import { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle } from "lucide-react";

import { useSeniatCalendar } from "../hooks/use-seniat-calendar";
import { useCountdown } from "../hooks/use-countdown";
import { useCompaniesLite } from "../hooks/use-companies-lite";
import { getNextUpcoming } from "../utils/calendar-builder";
import { todayLocalIso } from "../utils/date-helpers";

import { Hero } from "./hero";
import { RifInput } from "./rif-input";
import { CompanySelector } from "./company-selector";
import { TaxpayerTypeToggle } from "./taxpayer-type-toggle";
import { YearSelector } from "./year-selector";
import { CountdownBanner } from "./countdown-banner";
import { FilterChips } from "./filter-chips";
import { ViewToggle } from "./view-toggle";
import { CalendarGrid } from "./calendar-grid";
import { ObligationsList } from "./obligations-list";
import { ExportActions } from "./export-actions";
import { ReminderOptIn } from "./reminder-opt-in";
import { FaqSeniat } from "./faq-seniat";
import { EmptyState } from "./empty-state";
import { EmbedBadge } from "./embed-badge";

// ── Stagger animation pattern (from tools-shell.tsx) ─────────────────────────
const STAGGER_STEP = 0.08;
const section = (i: number) => ({
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay: i * STAGGER_STEP, ease: "easeOut" as const },
});

interface SeniatCalendarShellProps {
    variant: "public" | "embed" | "authed";
}

export function SeniatCalendarShell({ variant }: SeniatCalendarShellProps) {
    const {
        rif, setRif, rifFormatted, rifValid, rifTouched,
        taxpayerType, setTaxpayerType,
        year, setYear, availableYears,
        view, setView,
        filters, setFilters,
        entries,
    } = useSeniatCalendar();

    const { companies, loading: companiesLoading } = useCompaniesLite();
    const countdown = useCountdown(entries);

    const today = todayLocalIso();
    const nextEntry = useMemo(() => getNextUpcoming(entries, today), [entries, today]);
    const nextDueDate = nextEntry?.dueDate ?? null;

    // Auto-fill from first company with RIF when authenticated
    useEffect(() => {
        if (!rif && companies.length > 0) {
            const first = companies.find((c) => c.rif && !c.disabled);
            if (first?.rif) {
                setRif(first.rif);
                setTaxpayerType(first.taxpayerType);
            }
        }
    }, [companies, rif, setRif, setTaxpayerType]);

    const isEmbed = variant === "embed";
    const isAuthed = variant === "authed";
    const isPublic = variant === "public";

    const containerCls = isEmbed
        ? "max-w-[1200px] mx-auto w-full px-4 py-4 flex flex-col gap-4"
        : isAuthed
            ? "max-w-[1400px] mx-auto w-full px-4 sm:px-8 py-6 sm:py-8 flex flex-col gap-6"
            : "max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-6";

    const showCalendar = rifValid && entries.length > 0;
    const showEmpty = !rifValid && !rifTouched;
    const showError = rifTouched && !rifValid && rif.length > 0;

    const companyName = companies.find((c) => c.rif === rif)?.name;

    return (
        <div className={containerCls}>
            {/* Skip to content */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 z-50 px-3 py-1.5 bg-surface-1 border border-border-light rounded-lg text-[12px] font-mono"
            >
                Saltar al contenido
            </a>

            <main id="main-content" className="flex flex-col gap-6">
                {/* ── Hero (public only) ─────────────────────────────────────── */}
                {isPublic && (
                    <motion.div {...section(0)}>
                        <Hero nextEntry={nextEntry} hasRif={rifValid} />
                    </motion.div>
                )}

                {/* ── Controls strip ─────────────────────────────────────────── */}
                <motion.div {...section(isPublic ? 1 : 0)}>
                    <div className="rounded-2xl border border-border-light bg-surface-1 shadow-[var(--shadow-sm)]">

                        {/*
                         * Top row — RIF input / company selector / type toggle / year
                         *
                         * Layout strategy (avoids min-w collisions):
                         *   - Mobile (<md):  stack vertically, each row wraps naturally
                         *   - md+:           flex-row with flex-wrap
                         */}
                        <div className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-2.5">
                            {!isEmbed && (
                                <>
                                    <RifInput
                                        value={rifFormatted}
                                        onChange={setRif}
                                        touched={rifTouched}
                                        valid={rifValid}
                                    />
                                    {companies.length > 0 && (
                                        <CompanySelector
                                            companies={companies}
                                            loading={companiesLoading}
                                            selectedId={companies.find((c) => c.rif === rif)?.id ?? null}
                                            onSelect={(id) => {
                                                const company = companies.find((c) => c.id === id);
                                                if (company?.rif) {
                                                    setRif(company.rif);
                                                    setTaxpayerType(company.taxpayerType);
                                                }
                                            }}
                                        />
                                    )}
                                    <TaxpayerTypeToggle
                                        value={taxpayerType}
                                        onChange={setTaxpayerType}
                                    />
                                </>
                            )}
                            <YearSelector
                                value={year}
                                onChange={setYear}
                                years={availableYears}
                            />
                        </div>

                        {/* Bottom strip: filters + view + actions */}
                        <div className="border-t border-border-light bg-surface-2/60 rounded-b-2xl px-4 sm:px-5 py-3 flex items-center justify-between gap-4 min-w-0 flex-wrap">
                            <div className="flex-1 min-w-0">
                                <FilterChips
                                    activeCategories={filters.categories}
                                    onChange={(cats) => setFilters({ categories: cats })}
                                />
                            </div>

                            {/* Actions cluster — wraps on very narrow screens */}
                            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                                <ViewToggle value={view} onChange={setView} />
                                <ExportActions
                                    entries={entries}
                                    rif={rif}
                                    taxpayerType={taxpayerType}
                                    year={year}
                                    companyName={companyName}
                                    embedMode={isEmbed}
                                />
                                {!isEmbed && rifValid && (
                                    <ReminderOptIn rif={rif} taxpayerType={taxpayerType} />
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ── Countdown banner ───────────────────────────────────────── */}
                {countdown.severity !== "none" && entries.length > 0 && (
                    <motion.div {...section(isPublic ? 2 : 1)}>
                        <CountdownBanner countdown={countdown} />
                    </motion.div>
                )}

                {/* ── sr-only live region for view changes ───────────────────── */}
                <span className="sr-only" aria-live="polite" id="view-announcer">
                    {view === "grid" ? "Vista mensual activada" : "Vista lista activada"}
                </span>

                {/* ── Main calendar area ─────────────────────────────────────── */}
                <motion.div {...section(isPublic ? 3 : 2)}>
                    <div
                        id="seniat-calendar-exportable"
                        className="force-light-vars"
                    >
                        {/* Export-only header (hidden normally, visible during PNG export) */}
                        <div className="hidden seniat-export-header p-4 mb-4 rounded-xl border border-border-light bg-surface-1">
                            <p className="font-mono text-[12px] text-foreground/50">
                                Calendario Tributario SENIAT {year} · {rif} ·{" "}
                                {taxpayerType === "especial" ? "Sujeto Pasivo Especial" : "Contribuyente Ordinario"}
                            </p>
                        </div>

                        <AnimatePresence mode="wait">
                            {showEmpty && (
                                <motion.div
                                    key="empty"
                                    initial={{ opacity: 0, x: 6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }}
                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                >
                                    <EmptyState />
                                </motion.div>
                            )}

                            {showError && (
                                <motion.div
                                    key="error"
                                    initial={{ opacity: 0, x: 6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }}
                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                    className="flex flex-col items-center justify-center gap-3 py-20"
                                    role="alert"
                                    aria-live="assertive"
                                >
                                    <AlertCircle size={32} className="text-text-error" strokeWidth={1.5} />
                                    <p className="text-[13px] font-mono text-text-error/80">
                                        RIF inválido. Ingresa el formato correcto: J-12345678-9
                                    </p>
                                </motion.div>
                            )}

                            {showCalendar && view === "grid" && (
                                <motion.div
                                    key="grid"
                                    initial={{ opacity: 0, x: 6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }}
                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                >
                                    <CalendarGrid
                                        entries={entries}
                                        year={year}
                                        nextEntryDueDate={nextDueDate}
                                    />
                                </motion.div>
                            )}

                            {showCalendar && view === "lista" && (
                                <motion.div
                                    key="lista"
                                    initial={{ opacity: 0, x: 6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }}
                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                >
                                    <ObligationsList
                                        entries={entries}
                                        nextEntryId={nextEntry?.obligationId}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>

                {/* ── FAQ (public only) ──────────────────────────────────────── */}
                {isPublic && (
                    <motion.div {...section(4)}>
                        <FaqSeniat />
                    </motion.div>
                )}

            </main>

            {/* Embed badge */}
            {isEmbed && <EmbedBadge />}
        </div>
    );
}
