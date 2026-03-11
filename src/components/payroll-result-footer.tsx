"use client";

// ============================================================================
// PAYROLL RESULT FOOTER
// Dark result strip displayed below the accordion.
// Receives pre-computed totals — zero calculation logic inside.
// ============================================================================

// ── Internal stat cell ────────────────────────────────────────────────────

const StatCell = ({
    label, children, accent = false,
}: {
    label:    string;
    children: React.ReactNode;
    accent?:  boolean;
}) => (
    <div className="flex flex-col">
        <span className={[
            "text-[10px] uppercase opacity-40 mb-1 tracking-wider",
            accent ? "font-bold text-primary-400" : "",
        ].join(" ")}>
            {label}
        </span>
        {children}
    </div>
);

const VDivider = () => <div className="h-12 w-px bg-white/10" />;

// ── Footer ────────────────────────────────────────────────────────────────

export const PayrollResultFooter = ({
    netAmount,
    grossAmount,
    totalDeductions,
    bcvRate,
}: {
    netAmount:       number;
    grossAmount:     number;
    totalDeductions: number;
    bcvRate:         number;
}) => {
    const netUSD = bcvRate > 0 ? netAmount / bcvRate : 0;

    return (
        <footer className="p-6 bg-foreground text-background rounded-2xl flex justify-between items-center shadow-2xl border border-white/10">
            <div className="flex gap-12 items-center tabular-nums">
                <StatCell label="Neto Total a Pagar (VES)" accent>
                    <span className="text-4xl font-black tracking-tighter text-primary-400">
                        {netAmount.toFixed(2)}
                    </span>
                </StatCell>

                <VDivider />

                <StatCell label="Equivalente en Divisas">
                    <span className="text-2xl font-bold">
                        {netUSD.toFixed(2)}{" "}
                        <span className="text-xs opacity-40 italic font-mono">USD</span>
                    </span>
                </StatCell>

                <VDivider />

                <StatCell label="Bruto (VES)">
                    <span className="text-lg font-semibold opacity-70">
                        {grossAmount.toFixed(2)}
                    </span>
                </StatCell>

                <StatCell label="Retenciones (VES)">
                    <span className="text-lg font-semibold text-red-400/80">
                        -{totalDeductions.toFixed(2)}
                    </span>
                </StatCell>
            </div>
        </footer>
    );
};