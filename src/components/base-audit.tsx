interface AuditRowProps {
    label: string;
    formula: string;
    value: number;
    isNegative?: boolean;
}

export const AuditRow = ({ label, formula, value, isNegative = false }: AuditRowProps) => (
    <div className="flex justify-between text-[10px] items-center text-neutral-500 italic">
        <span>{label}: ({formula})</span>
        <span className={`${isNegative ? "text-danger-500" : "text-primary-500"} font-bold tabular-nums`}>
            {isNegative ? "-" : "+"}{value.toFixed(2)}
        </span>
    </div>
);

export const AuditContainer = ({ children, title, total, type = "income" }: any) => (
    <div className={`bg-surface-1 border border-border-light p-4 rounded-lg space-y-3 border-l-4 ${type === 'income' ? 'border-l-primary-500' : 'border-l-danger-500'}`}>
        {children}
        <div className={`flex justify-between text-[11px] border-t border-dashed pt-2 font-bold uppercase ${type === 'income' ? 'text-primary-600' : 'text-danger-600'}`}>
            <span>{title}</span>
            <span className="tabular-nums">{type === 'deduction' && "-"}{total.toFixed(2)} VES</span>
        </div>
    </div>
);