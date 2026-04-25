// Shared section primitive for /settings pages.
// One card with a mono uppercase H2 + optional sans subtitle and an action slot.
// Body content goes in `children`; padding is intentional so callers can put
// raw rows or further-tinted wells without re-padding.

import type { ReactNode } from "react";

interface SettingsSectionProps {
    title: string;
    subtitle?: ReactNode;
    /** Right-aligned slot in the section header — usually a single button. */
    action?: ReactNode;
    /** Tone of the card: solid (default) or subtle (no border, no surface). */
    tone?: "solid" | "subtle";
    /** Removes default body padding (px-6 py-5) — useful for full-bleed tables. */
    flush?: boolean;
    children: ReactNode;
    className?: string;
}

export function SettingsSection({
    title,
    subtitle,
    action,
    tone = "solid",
    flush = false,
    children,
    className,
}: SettingsSectionProps) {
    const shell = tone === "solid"
        ? "rounded-xl border border-border-light bg-surface-1 shadow-sm shadow-black/[0.03] overflow-hidden"
        : "";

    return (
        <section className={[shell, className].filter(Boolean).join(" ")}>
            <header className={[
                "flex items-start justify-between gap-4",
                tone === "solid"
                    ? "px-6 py-4 border-b border-border-light bg-surface-2/40"
                    : "pb-2",
            ].join(" ")}>
                <div className="min-w-0">
                    <h2 className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                        {title}
                    </h2>
                    {subtitle && (
                        <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-1 leading-snug max-w-xl">
                            {subtitle}
                        </p>
                    )}
                </div>
                {action && (
                    <div className="flex items-center gap-2 shrink-0">
                        {action}
                    </div>
                )}
            </header>

            <div className={tone === "solid" && !flush ? "px-6 py-5" : ""}>
                {children}
            </div>
        </section>
    );
}
