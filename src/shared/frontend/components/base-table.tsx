"use client";

import React, { useState, useCallback, useMemo, useTransition } from "react";
import {
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    TableProps as HeroUITableProps,
    SortDescriptor,
    Button,
} from "@heroui/react";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BaseSelect, SelectItemData } from "@/src/shared/frontend/components/base-select";
import { APP_SIZES } from "@/src/shared/frontend/sizes";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Column<T extends object = object> {
    key: keyof T | string;
    label: string;
    align?: "start" | "center" | "end";
    width?: number;
    sortable?: boolean;
    searchable?: boolean;
    render?: (value: unknown, item: T, index: number) => React.ReactNode;
}

export interface BaseTableProps<T extends object = object>
    extends Omit<HeroUITableProps, "children"> {
    columns: Column<T>[];
    data: T[];
    keyExtractor: (item: T, index: number) => string | number;
    isLoading?: boolean;
    emptyContent?: React.ReactNode;
    onSortChange?: (descriptor: SortDescriptor) => void;
    sortDescriptor?: SortDescriptor;
    selectionMode?: "none" | "single" | "multiple";
    onSelectionChange?: (keys: "all" | Set<string | number>) => void;
    selectedKeys?: "all" | Iterable<string | number>;
    title?: string;
    pagination?: boolean | { defaultPageSize?: number; pageSizeOptions?: number[] };
    classNames?: {
        base?: string;
        table?: string;
        thead?: string;
        tbody?: string;
        tr?: string;
        th?: string;
        td?: string;
        wrapper?: string;
    };
    enableSearch?: boolean;
    /** Controlled search term — syncs with external state (e.g. URL params) */
    searchValue?: string;
    onSearchChange?: (value: string) => void;
    /** Controlled selected search columns */
    searchColumns?: Set<string | number>;
    onSearchColumnsChange?: (cols: Set<string | number>) => void;
    /**
     * Render an expanded detail panel below a row.
     * NOTE: Because HeroUI's TableBody only accepts TableRow children,
     * expanded rows are rendered in a separate stacked container below
     * each matching row using an absolute-positioned overlay approach.
     * The BaseTable shell must be `position: relative` (it is by default).
     */
    renderExpandedRow?: (item: T) => React.ReactNode;
}

// ============================================================================
// HOOKS
// ============================================================================

export const useSort = <T extends object>(
    initialColumn?: keyof T,
    initialDirection: "ascending" | "descending" = "ascending"
) => {
    const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
        column: initialColumn as string,
        direction: initialDirection,
    });

    const sortedData = useCallback(
        (data: T[]) => {
            if (!sortDescriptor.column) return data;
            return [...data].sort((a, b) => {
                const col = sortDescriptor.column as keyof T;
                // Cast to comparable primitives — values come from user data rows
                const f = a[col] as string | number | boolean | null | undefined;
                const s = b[col] as string | number | boolean | null | undefined;
                let cmp = 0;
                if (typeof f === typeof s) {
                    cmp = (f as string) < (s as string) ? -1 : (f as string) > (s as string) ? 1 : 0;
                } else {
                    cmp = String(f) < String(s) ? -1 : String(f) > String(s) ? 1 : 0;
                }
                return sortDescriptor.direction === "descending" ? -cmp : cmp;
            });
        },
        [sortDescriptor]
    );

    return { sortDescriptor, setSortDescriptor, sortedData };
};

export const usePagination = <T extends object>(itemsPerPage = 10) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(itemsPerPage);

    const paginatedData = useCallback(
        (data: T[]) => {
            const start = (currentPage - 1) * pageSize;
            return data.slice(start, start + pageSize);
        },
        [currentPage, pageSize]
    );

    const totalPages = (data: T[]) => Math.max(1, Math.ceil(data.length / pageSize));

    return { currentPage, setCurrentPage, pageSize, setPageSize, paginatedData, totalPages };
};

// ============================================================================
// DESIGN TOKENS — canon formal: border-light, rounded-xl, mono, sobrio
// ============================================================================

const S = {
    shell: [
        "w-full font-mono",
        "bg-surface-1",
        "border border-border-light",
        "rounded-xl overflow-hidden",
        "shadow-[0_1px_2px_rgba(0,0,0,.04)]",
        "dark:shadow-[0_1px_2px_rgba(0,0,0,.2)]",
    ].join(" "),

    toolbar: [
        "px-4 py-3",
        "bg-surface-1",
        "border-b border-border-light",
        "flex flex-col gap-2.5",
    ].join(" "),

    toolbarRow: "flex flex-col sm:flex-row gap-2 items-start sm:items-center",

    th: [
        "bg-surface-2",
        "border-b border-border-light",
        `font-mono ${APP_SIZES.text.tableHeader} uppercase`,
        "text-neutral-500 dark:text-neutral-400",
        APP_SIZES.spacing.tableHeader,
        "select-none",
        "text-left data-[align=center]:text-center data-[align=end]:text-right",
        "justify-start data-[align=center]:justify-center data-[align=end]:justify-end",
    ].join(" "),

    td: [
        APP_SIZES.spacing.tableCell,
        `font-mono ${APP_SIZES.text.tableBody} text-foreground`,
        "border-b border-border-light",
        "align-middle",
    ].join(" "),

    tr: [
        "transition-colors duration-100",
        "hover:bg-neutral-50 dark:hover:bg-neutral-900/40",
        "data-[selected=true]:bg-primary-50/40 dark:data-[selected=true]:bg-primary-900/10",
    ].join(" "),

    tableWrapper: [
        "bg-surface-1",
        "rounded-none shadow-none border-none p-0",
    ].join(" "),

    footer: [
        "px-4 py-2.5",
        "bg-surface-2",
        "border-t border-border-light",
        "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3",
    ].join(" "),

    empty: [
        "py-20 flex flex-col items-center gap-3",
        "text-neutral-400 dark:text-neutral-600",
    ].join(" "),
} as const;

// ============================================================================
// ICONS
// ============================================================================

const SearchIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
        className="text-neutral-400 flex-shrink-0"
    >
        <circle cx="5.5" cy="5.5" r="4" />
        <path d="M9 9L11.5 11.5" />
    </svg>
);

const ClearIcon = () => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    >
        <path d="M1 1l9 9M10 1L1 10" />
    </svg>
);

const ChevronLeftIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    >
        <path d="M7.5 2L4 6L7.5 10" />
    </svg>
);

const ChevronRightIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    >
        <path d="M4.5 2L8 6L4.5 10" />
    </svg>
);

const ChevronsLeftIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    >
        <path d="M6.5 2L3 6L6.5 10M10 2L6.5 6L10 10" />
    </svg>
);

const ChevronsRightIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    >
        <path d="M5.5 2L9 6L5.5 10M2 2L5.5 6L2 10" />
    </svg>
);

const EmptyTableIcon = () => (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none"
        className="text-neutral-300 dark:text-neutral-700"
    >
        <rect x="3" y="7" width="30" height="22" rx="2"
            stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2" />
        <line x1="3" y1="13" x2="33" y2="13" stroke="currentColor" strokeWidth="1.4" />
        <line x1="14" y1="7" x2="14" y2="29" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
        <line x1="26" y1="7" x2="26" y2="29" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
        {[18, 23].map((y) => (
            <g key={y}>
                <circle cx="8.5"  cy={y} r="1.3" fill="currentColor" opacity="0.45" />
                <circle cx="20"   cy={y} r="1.3" fill="currentColor" opacity="0.3"  />
                <circle cx="29.5" cy={y} r="1.3" fill="currentColor" opacity="0.18" />
            </g>
        ))}
    </svg>
);

// ============================================================================
// SORT CHEVRONS
// ============================================================================

const SortChevrons = ({ active, dir }: { active: boolean; dir?: "ascending" | "descending" }) => (
    <span className="inline-flex flex-col gap-[2px] ml-1.5 opacity-50 align-middle">
        <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor"
            className={active && dir === "ascending"
                ? "opacity-100 text-primary-500 dark:text-primary-400"
                : "text-neutral-400 dark:text-neutral-600"}
        >
            <path d="M3 0L6 4H0z" />
        </svg>
        <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor"
            className={active && dir === "descending"
                ? "opacity-100 text-primary-500 dark:text-primary-400"
                : "text-neutral-400 dark:text-neutral-600"}
        >
            <path d="M3 4L0 0h6z" />
        </svg>
    </span>
);

// ============================================================================
// RESULT BADGE
// ============================================================================

const ResultBadge = ({ filtered, total }: { filtered: number; total: number }) =>
    filtered !== total ? (
        <div className={[
            "inline-flex items-center gap-1 px-2 h-[22px] rounded-md flex-shrink-0",
            "bg-neutral-100 dark:bg-neutral-800",
            "border border-border-light",
            `font-mono ${APP_SIZES.text.resultBadge} whitespace-nowrap`,
            "text-neutral-600 dark:text-neutral-400",
        ].join(" ")}>
            <span className="font-bold">{filtered.toLocaleString()}</span>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <span>{total.toLocaleString()}</span>
        </div>
    ) : null;

// ============================================================================
// SCAN BAR
// ============================================================================

const ScanBar = ({ visible }: { visible: boolean }) =>
    visible ? (
        <div className="h-[1px] bg-border-light overflow-hidden">
            <div
                className="h-full bg-primary-400 dark:bg-primary-500"
                style={{ animation: "basetable-scan 1s ease-in-out infinite" }}
            />
        </div>
    ) : null;

// ============================================================================
// PAGE BUTTON
// ============================================================================

const PageBtn = ({
    children,
    disabled,
    active,
    onPress,
    isIconOnly = false,
}: {
    children: React.ReactNode;
    disabled?: boolean;
    active?: boolean;
    onPress?: () => void;
    isIconOnly?: boolean;
}) => (
    <button
        onClick={onPress}
        disabled={disabled}
        className={[
            isIconOnly ? "w-8 h-8" : "h-8 px-2.5 min-w-[2rem]",
            "inline-flex items-center justify-center rounded-md",
            `font-mono ${APP_SIZES.text.paginationButton} tabular-nums`,
            "border transition-colors duration-100",
            "disabled:opacity-30 disabled:cursor-not-allowed",
            active
                ? "bg-primary-500 border-primary-500 text-white font-semibold"
                : [
                    "bg-surface-1 border-border-light",
                    "text-neutral-500 dark:text-neutral-400",
                    "hover:border-border-medium hover:text-foreground",
                ].join(" "),
        ].join(" ")}
    >
        {children}
    </button>
);

// ============================================================================
// PAGINATION FOOTER
// ============================================================================

const PaginationFooter = ({
    currentPage,
    totalPages,
    pageSize,
    pageSizeOptions,
    totalItems,
    visibleCount,
    onPageChange,
    onPageSizeChange,
}: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    pageSizeOptions: number[];
    totalItems: number;
    visibleCount: number;
    onPageChange: (p: number) => void;
    onPageSizeChange: (s: number) => void;
}) => {
    const pageNumbers = useMemo(() => {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        const pages: (number | "…")[] = [1];
        if (currentPage > 3) pages.push("…");
        for (
            let i = Math.max(2, currentPage - 1);
            i <= Math.min(totalPages - 1, currentPage + 1);
            i++
        ) pages.push(i);
        if (currentPage < totalPages - 2) pages.push("…");
        pages.push(totalPages);
        return pages;
    }, [currentPage, totalPages]);

    return (
        <div className={S.footer}>
            {/* left — record count + page size */}
            <div className="flex items-center gap-3 flex-wrap">
                <p className={`font-mono ${APP_SIZES.text.paginationCount} text-neutral-400 dark:text-neutral-500 whitespace-nowrap`}>
                    <span className="text-foreground font-semibold">{visibleCount.toLocaleString()}</span>
                    {" "}de{" "}
                    <span className="text-foreground font-semibold">{totalItems.toLocaleString()}</span>
                    {" "}registros
                </p>

                <div className="flex items-center gap-1.5">
                    <span className={`font-mono ${APP_SIZES.text.paginationRowsLabel} text-neutral-400`}>
                        Filas
                    </span>
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            onPageSizeChange(Number(e.target.value));
                            onPageChange(1);
                        }}
                        className={[
                            `font-mono ${APP_SIZES.text.paginationCount} text-foreground`,
                            "bg-surface-1 border border-border-light rounded-md",
                            "px-2 py-0.5 cursor-pointer",
                            "focus:outline-none focus:border-primary-400",
                            "transition-colors",
                        ].join(" ")}
                    >
                        {pageSizeOptions.map((v) => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* right — pagination */}
            {totalPages > 1 && (
                <div className="flex items-center gap-1">
                    <PageBtn isIconOnly disabled={currentPage === 1} onPress={() => onPageChange(1)}>
                        <ChevronsLeftIcon />
                    </PageBtn>
                    <PageBtn isIconOnly disabled={currentPage === 1} onPress={() => onPageChange(currentPage - 1)}>
                        <ChevronLeftIcon />
                    </PageBtn>

                    <div className="flex items-center gap-1 mx-0.5">
                        {pageNumbers.map((p, i) =>
                            p === "…" ? (
                                <span key={`e${i}`}
                                    className={`w-8 text-center font-mono ${APP_SIZES.text.paginationButton} text-neutral-300 dark:text-neutral-700`}>
                                    …
                                </span>
                            ) : (
                                <PageBtn
                                    key={p}
                                    active={p === currentPage}
                                    onPress={() => onPageChange(p as number)}
                                >
                                    {p}
                                </PageBtn>
                            )
                        )}
                    </div>

                    <PageBtn isIconOnly disabled={currentPage >= totalPages} onPress={() => onPageChange(currentPage + 1)}>
                        <ChevronRightIcon />
                    </PageBtn>
                    <PageBtn isIconOnly disabled={currentPage >= totalPages} onPress={() => onPageChange(totalPages)}>
                        <ChevronsRightIcon />
                    </PageBtn>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// CELL RENDERER
// ============================================================================

const renderCellValue = <T extends object>(
    value: unknown,
    item: T,
    index: number,
    column: Column<T>
): React.ReactNode => {
    if (column.render) return column.render(value, item, index);

    if (value === null || value === undefined)
        return <span className="text-neutral-300 dark:text-neutral-700 select-none">—</span>;

    if (typeof value === "boolean")
        return (
            <span className={[
                `inline-flex items-center gap-1.5 font-mono ${APP_SIZES.text.badge} uppercase`,
                value ? "text-success" : "text-error",
            ].join(" ")}>
                <span className={[
                    "w-1.5 h-1.5 rounded-[2px] flex-shrink-0",
                    value ? "bg-success" : "bg-error",
                ].join(" ")} />
                {value ? "true" : "false"}
            </span>
        );

    if (value instanceof Date)
        return (
            <span className={`font-mono ${APP_SIZES.text.dateCell} text-neutral-500 dark:text-neutral-400 tabular-nums`}>
                {value.toLocaleDateString("es-VE")}
            </span>
        );

    if (typeof value === "number")
        return <span className="font-mono tabular-nums">{value.toLocaleString("es-VE")}</span>;

    return <span className="font-mono">{String(value)}</span>;
};

// ============================================================================
// FILTER HELPER
// ============================================================================

const filterData = <T extends object>(
    data: T[],
    term: string,
    colKeys: string[],
    allCols: Column<T>[]
): T[] => {
    if (!term.trim()) return data;
    const targets =
        colKeys.length > 0
            ? colKeys
            : allCols.filter((c) => c.searchable !== false).map((c) => String(c.key));
    const q = term.toLowerCase().trim();
    return data.filter((item) =>
        targets.some((k) => String(item[k as keyof T]).toLowerCase().includes(q))
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const RenderTable = <T extends object>({
    columns,
    data,
    keyExtractor,
    isLoading = false,
    emptyContent = "Sin resultados",
    onSortChange,
    sortDescriptor,
    selectionMode = "none",
    selectedKeys,
    onSelectionChange,
    enableSearch = false,
    pagination = false,
    title,
    classNames = {},
    // ── controlled search props ──────────────────────────────────────────────
    searchValue,
    onSearchChange,
    searchColumns,
    onSearchColumnsChange,
    renderExpandedRow,
    ...props
}: BaseTableProps<T>) => {
    // Internal state — used when props are NOT controlled
    const [internalSearchTerm, setInternalSearchTerm]   = useState("");
    const [internalSearchCols, setInternalSearchCols]   = useState<Set<string | number>>(new Set());
    const [isPending, startTransition]                  = useTransition();

    // Resolved values — controlled takes priority over internal
    const searchTerm  = searchValue   !== undefined ? searchValue   : internalSearchTerm;
    const selectedCols = searchColumns !== undefined ? searchColumns : internalSearchCols;

    const paginationEnabled = !!pagination;
    const paginationConfig  = typeof pagination === "object" ? pagination : {};
    const defaultPageSize   = paginationConfig.defaultPageSize ?? 10;
    const pageSizeOptions   = paginationConfig.pageSizeOptions ?? [5, 10, 20, 50];

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize]       = useState(defaultPageSize);

    const filteredData = useMemo(
        () => filterData(data, searchTerm, Array.from(selectedCols).map(String), columns),
        [data, searchTerm, selectedCols, columns]
    );

    const totalPages = paginationEnabled
        ? Math.max(1, Math.ceil(filteredData.length / pageSize))
        : 1;

    const displayData = useMemo(() => {
        if (!paginationEnabled) return filteredData;
        const start = (currentPage - 1) * pageSize;
        return filteredData.slice(start, start + pageSize);
    }, [filteredData, paginationEnabled, currentPage, pageSize]);

    const handleSearchChange = (v: string) => {
        startTransition(() => {
            if (onSearchChange) {
                onSearchChange(v);
            } else {
                setInternalSearchTerm(v);
            }
            setCurrentPage(1);
        });
    };

    const handleColsChange = (k: Set<string | number>) => {
        if (onSearchColumnsChange) {
            onSearchColumnsChange(k);
        } else {
            setInternalSearchCols(k);
        }
        setCurrentPage(1);
    };

    const getIdx = useCallback((item: T) => displayData.indexOf(item), [displayData]);

    const colSelectItems: SelectItemData[] = columns
        .filter((c) => c.searchable !== false)
        .map((c) => ({ id: String(c.key), name: c.label }));

    const hasFilter = !!searchTerm || selectedCols.size > 0;

    const clearFilters = () => {
        handleSearchChange("");
        handleColsChange(new Set());
        setCurrentPage(1);
    };

    return (
        <div className={S.shell}>

            {/* ── TOOLBAR ─────────────────────────────────────────────────── */}
            {enableSearch && (
                <div className={S.toolbar}>
                    <div className={S.toolbarRow}>
                        {title && (
                            <span className={`font-mono ${APP_SIZES.text.tableTitle} uppercase text-neutral-400 dark:text-neutral-500 whitespace-nowrap hidden sm:block mr-1`}>
                                {title}
                            </span>
                        )}

                        <div className="flex-1 min-w-0">
                            <BaseInput.Field
                                label=""
                                placeholder="Buscar..."
                                value={searchTerm}
                                onValueChange={handleSearchChange}
                                startContent={<SearchIcon />}
                            />
                        </div>

                        <div className="w-full sm:w-[190px] flex-shrink-0">
                            <BaseSelect
                                items={colSelectItems}
                                selectedKeys={selectedCols}
                                onSelectionChange={(k) => handleColsChange(k as Set<string | number>)}
                                placeholder="Columnas"
                                showAvatar={false}
                                maxChips={1}
                            />
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                            <ResultBadge filtered={filteredData.length} total={data.length} />
                            {hasFilter && (
                                <Button
                                    isIconOnly
                                    variant="flat"
                                    size="sm"
                                    onPress={clearFilters}
                                    aria-label="Limpiar filtros"
                                    className={[
                                        "h-[38px] w-[38px] min-w-0 rounded-lg",
                                        "border border-border-light bg-surface-1",
                                        "text-neutral-400",
                                        "hover:border-error/50 hover:text-error hover:bg-error/5",
                                        "transition-all duration-150",
                                    ].join(" ")}
                                >
                                    <ClearIcon />
                                </Button>
                            )}
                        </div>
                    </div>
                    <ScanBar visible={isPending} />
                </div>
            )}

            {/* ── TABLE ───────────────────────────────────────────────────── */}
            {renderExpandedRow ? (
                /* Native table — needed because HeroUI TableBody cannot render
                   React.Fragment children (required for expand sub-rows).      */
                <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                        <thead>
                            <tr>
                                {columns.map((col) => (
                                    <th
                                        key={String(col.key)}
                                        style={col.width ? { width: col.width } : undefined}
                                        className={[
                                            S.th,
                                            col.align === "end"    ? "text-right"  : "",
                                            col.align === "center" ? "text-center" : "",
                                            col.sortable ? "cursor-pointer select-none hover:bg-neutral-100 dark:hover:bg-neutral-800" : "",
                                        ].join(" ")}
                                        onClick={() => {
                                            if (!col.sortable || !onSortChange) return;
                                            const nextDir =
                                                sortDescriptor?.column === String(col.key) &&
                                                sortDescriptor?.direction === "ascending"
                                                    ? "descending"
                                                    : "ascending";
                                            onSortChange({ column: String(col.key), direction: nextDir });
                                        }}
                                    >
                                        <span className="inline-flex items-center">
                                            {col.label}
                                            {col.sortable && (
                                                <SortChevrons
                                                    active={sortDescriptor?.column === String(col.key)}
                                                    dir={sortDescriptor?.direction}
                                                />
                                            )}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {displayData.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length}>
                                        <div className={S.empty}>
                                            <EmptyTableIcon />
                                             <div className={`font-mono ${APP_SIZES.text.emptyState}`}>
                                                {emptyContent}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                displayData.map((item) => {
                                    const key = String(keyExtractor(item, getIdx(item)));
                                    const expandedContent = renderExpandedRow(item);
                                    return (
                                        <React.Fragment key={key}>
                                            <tr className={[
                                                S.tr,
                                                "transition-colors duration-100",
                                            ].join(" ")}>
                                                {columns.map((col) => (
                                                    <td
                                                        key={String(col.key)}
                                                        className={[
                                                            S.td,
                                                            col.align === "end"    ? "text-right"  : "",
                                                            col.align === "center" ? "text-center" : "",
                                                        ].join(" ")}
                                                    >
                                                        {renderCellValue(
                                                            item[col.key as keyof T],
                                                            item,
                                                            getIdx(item),
                                                            col
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                            {expandedContent != null && (
                                                <tr className="bg-transparent hover:bg-transparent">
                                                    <td
                                                        colSpan={columns.length}
                                                        className="p-0 border-b border-border-light"
                                                    >
                                                        {expandedContent}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
            <Table
                aria-label="Tabla de datos"
                selectionMode={selectionMode}
                selectedKeys={selectedKeys}
                onSelectionChange={onSelectionChange}
                sortDescriptor={sortDescriptor}
                onSortChange={onSortChange}
                classNames={{
                    base: "overflow-visible",
                    table: "min-w-full border-separate border-spacing-0",
                    thead: "",
                    th: S.th,
                    tr: S.tr,
                    td: S.td,
                    wrapper: [S.tableWrapper, classNames.wrapper ?? ""].join(" "),
                }}
                {...props}
            >
                <TableHeader>
                    {columns.map((col) => (
                        <TableColumn
                            key={String(col.key)}
                            allowsSorting={col.sortable}
                            align={col.align ?? "start"}
                            width={col.width}
                        >
                            <span className="inline-flex items-center">
                                {col.label}
                                {col.sortable && (
                                    <SortChevrons
                                        active={sortDescriptor?.column === String(col.key)}
                                        dir={sortDescriptor?.direction}
                                    />
                                )}
                            </span>
                        </TableColumn>
                    ))}
                </TableHeader>

                <TableBody
                    items={displayData}
                    isLoading={isLoading || isPending}
                    emptyContent={
                        <div className={S.empty}>
                            <EmptyTableIcon />
                            <div className={`font-mono ${APP_SIZES.text.emptyState}`}>
                                {emptyContent}
                            </div>
                        </div>
                    }
                >
                    {(item) => (
                        <TableRow key={keyExtractor(item, getIdx(item))}>
                            {columns.map((col) => (
                                <TableCell key={String(col.key)}>
                                    {renderCellValue(
                                        item[col.key as keyof T],
                                        item,
                                        getIdx(item),
                                        col
                                    )}
                                </TableCell>
                            ))}
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            )}

            {/* ── PAGINATION FOOTER ───────────────────────────────────────── */}
            {paginationEnabled && (
                <PaginationFooter
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    pageSizeOptions={pageSizeOptions}
                    totalItems={filteredData.length}
                    visibleCount={displayData.length}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                />
            )}

            <style>{`
                @keyframes basetable-scan {
                    0%   { width: 0%;   margin-left: 0%   }
                    50%  { width: 55%;  margin-left: 22%  }
                    100% { width: 0%;   margin-left: 100% }
                }
            `}</style>
        </div>
    );
};

// ============================================================================
// EXPORTS
// ============================================================================

export const BaseTable = {
    Render: RenderTable,
    useSort,
    usePagination,
} as const;