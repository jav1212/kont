// Server-Component-safe loading skeleton.
// Used as Suspense fallback by the loading.tsx files in the (app) routes.
// Renders a section header placeholder + a table-shaped block of rows.

const SHELL_CLASSES = [
    "w-full font-mono",
    "bg-surface-1",
    "border border-border-light",
    "rounded-xl overflow-hidden",
    "shadow-[0_1px_2px_rgba(0,0,0,.04)]",
    "dark:shadow-[0_1px_2px_rgba(0,0,0,.2)]",
].join(" ");

const PULSE = "animate-pulse rounded-sm bg-neutral-200 dark:bg-neutral-800";

export interface PageLoadingSkeletonProps {
    rows?: number;
    columns?: number;
    showToolbar?: boolean;
}

export function PageLoadingSkeleton({
    rows = 8,
    columns = 5,
    showToolbar = true,
}: PageLoadingSkeletonProps) {
    return (
        <div className="flex-1 flex flex-col gap-6 p-6">
            {/* Page header */}
            <div className="flex flex-col gap-3">
                <div className={`${PULSE} h-3 w-32`} />
                <div className={`${PULSE} h-7 w-64`} />
                <div className={`${PULSE} h-3 w-96 max-w-full`} />
            </div>

            {/* Table */}
            <div className={SHELL_CLASSES}>
                {showToolbar && (
                    <div className="px-4 py-3 bg-surface-1 border-b border-border-light flex items-center gap-3">
                        <div className={`${PULSE} h-9 flex-1 max-w-md`} />
                        <div className={`${PULSE} h-9 w-[190px] hidden sm:block`} />
                    </div>
                )}

                {/* header row */}
                <div
                    className="grid items-center bg-surface-2 border-b border-border-light px-4 py-3 gap-4"
                    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
                >
                    {Array.from({ length: columns }).map((_, i) => (
                        <div key={i} className={`${PULSE} h-2.5`} style={{ width: i === 0 ? "70%" : "55%" }} />
                    ))}
                </div>

                {/* data rows */}
                {Array.from({ length: rows }).map((_, rowIdx) => (
                    <div
                        key={rowIdx}
                        className="grid items-center border-b border-border-light px-4 py-3.5 gap-4 last:border-b-0"
                        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
                    >
                        {Array.from({ length: columns }).map((_, colIdx) => {
                            const widths = ["55%", "70%", "40%", "85%", "60%", "75%", "45%"];
                            const width = widths[(rowIdx * 3 + colIdx) % widths.length];
                            return <div key={colIdx} className={`${PULSE} h-3`} style={{ width }} />;
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
