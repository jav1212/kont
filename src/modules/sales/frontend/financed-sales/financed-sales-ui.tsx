// Presentation primitives shared by the financed-sales calculator and ledger screens.

import type { ReactNode } from "react";

export const INPUT_CLS = "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground tabular-nums focus:border-primary-500/60";

export function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <section className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
            <div className="px-5 py-3 border-b border-border-light flex items-center justify-between gap-4">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">{title}</h2>
                {typeof aside === "string" ? <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{aside}</span> : aside}
            </div>
            <div className="p-5">{children}</div>
        </section>
    );
}

export function FieldLabel({ children }: { children: ReactNode }) {
    return <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1">{children}</label>;
}

export function NumberField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
    return (
        <div>
            <FieldLabel>{label}</FieldLabel>
            <EditableCell value={value} onCommit={(next) => { if (next.trim()) onCommit(next.trim().replace(",", ".")); }} />
        </div>
    );
}

/** Text input that commits on blur or Enter, so the report is not recalculated on every keystroke. */

export function EditableCell({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (value: string) => void }) {
    // Keyed by the committed value so an external change resets the uncontrolled draft.
    return (
        <input key={value} defaultValue={value} placeholder={placeholder} inputMode="decimal"
            onBlur={(event) => { if (event.target.value !== value) onCommit(event.target.value); }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
            className={`${INPUT_CLS} h-8 min-w-[96px] text-right`} />
    );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
    return (
        <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-[13px]">
                <thead>
                    <tr className="border-b border-border-light bg-surface-2/50">
                        {headers.map((header, index) => (
                            <th key={header} className={["px-3 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap", index === 0 ? "text-left" : "text-right"].join(" ")}>{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

export function Cell({ children, left, tone }: { children: ReactNode; left?: boolean; tone?: "success" | "warning" }) {
    return (
        <td className={["px-3 py-1.5 tabular-nums whitespace-nowrap", left ? "text-left" : "text-right", tone === "success" ? "text-text-success" : tone === "warning" ? "text-text-warning" : "text-foreground"].join(" ")}>
            {children}
        </td>
    );
}
