import type { ReactNode } from "react";

// Shared audit row and container components for payroll deduction/income breakdowns.
// Architectural role: shared UI primitive — must not contain business-specific logic.

interface AuditRowProps {
    label: string;
    formula: string;
    value: number;
    isNegative?: boolean;
    onRemove?: () => void;
}

interface AuditContainerProps {
    children: ReactNode;
    title: string;
    total: number;
    type?: "income" | "deduction";
}

export const AuditRow = ({ label, formula, value, isNegative = false, onRemove }: AuditRowProps) => (
    <div className="flex justify-between text-[10px] items-center text-neutral-500 italic gap-2">
        <span className="flex-1 min-w-0 truncate">{label}: ({formula})</span>
        <span className={`${isNegative ? "text-danger-500" : "text-primary-500"} font-bold tabular-nums shrink-0`}>
            {isNegative ? "-" : "+"}{value.toFixed(2)}
        </span>
        {onRemove && (
            <button
                type="button"
                onClick={onRemove}
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md border border-border-light text-[var(--text-disabled)] hover:text-red-400 hover:border-red-400/40 transition-colors duration-150"
                title="Excluir esta línea para este empleado"
                aria-label="Excluir línea"
            >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 1l6 6M7 1L1 7" />
                </svg>
            </button>
        )}
    </div>
);

export const AuditContainer = ({ children, title, total, type = "income" }: AuditContainerProps) => (
    <div className={`bg-surface-1 border border-border-light p-4 rounded-lg space-y-3 border-l-4 ${type === 'income' ? 'border-l-primary-500' : 'border-l-danger-500'}`}>
        {children}
        <div className={`flex justify-between text-[11px] border-t border-dashed pt-2 font-bold uppercase ${type === 'income' ? 'text-primary-600' : 'text-danger-600'}`}>
            <span>{title}</span>
            <span className="tabular-nums">{type === 'deduction' && "-"}{total.toFixed(2)} VES</span>
        </div>
    </div>
);