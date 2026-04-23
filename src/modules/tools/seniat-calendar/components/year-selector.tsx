"use client";

interface YearSelectorProps {
    value: number;
    onChange: (year: number) => void;
    years: number[];
}

export function YearSelector({ value, onChange, years }: YearSelectorProps) {
    return (
        <div
            className="flex gap-1 p-1 rounded-lg bg-surface-2 border border-border-light overflow-x-auto"
            role="group"
            aria-label="Seleccionar año fiscal"
        >
            {years.map((year) => {
                const isActive = year === value;
                return (
                    <button
                        key={year}
                        onClick={() => onChange(year)}
                        className={[
                            "px-3 py-1 rounded-md text-[11px] font-mono font-medium uppercase tracking-[0.1em] transition-colors duration-150 cursor-pointer whitespace-nowrap flex-shrink-0",
                            isActive
                                ? "bg-surface-1 text-text-primary shadow-sm border border-border-light"
                                : "text-text-tertiary hover:text-text-secondary hover:bg-surface-1",
                        ].join(" ")}
                        aria-pressed={isActive}
                    >
                        {year}
                    </button>
                );
            })}
        </div>
    );
}
