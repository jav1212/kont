"use client";

// Compact application header shared by authenticated pages. The title remains
// visually stable while secondary actions collapse into an overflow panel on
// constrained layouts. Descriptive context belongs to the page canvas, not to
// the application bar itself.

import {
    Children,
    isValidElement,
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, CircleHelp, MoreHorizontal } from "lucide-react";
import { useBcvRate } from "@/src/shared/frontend/components/bcv-pill";

interface PageHeaderProps {
    title: string;
    /** Supporting information rendered as part of the page canvas. */
    subtitle?: ReactNode;
    /** Legacy action slot. The last visible child is treated as primary. */
    children?: ReactNode;
    /** Explicit primary action for toolbars that need deterministic ordering. */
    primaryAction?: ReactNode;
    /** Explicit secondary actions, folded into “Más” when space is limited. */
    secondaryActions?: ReactNode;
    /** Compact contextual control such as the current BCV rate. */
    utilityAction?: ReactNode;
    /** Preserved for call-site compatibility; BETA remains visible in navigation. */
    beta?: boolean;
    /** Hide the compact overflow trigger when a page has no header actions. */
    hideOverflow?: boolean;
}

function isScreenReaderOnly(node: ReactNode): boolean {
    if (!isValidElement<{ className?: string }>(node)) return false;
    return node.props.className?.split(/\s+/).includes("sr-only") ?? false;
}

function unwrapLegacyActionGroup(nodes: ReactNode[]): ReactNode[] {
    if (nodes.length !== 1) return nodes;
    const onlyNode = nodes[0];
    if (!isValidElement<{ children?: ReactNode; className?: string }>(onlyNode)) return nodes;
    if (onlyNode.type !== "div" || onlyNode.props.className?.includes("hidden")) return nodes;
    const nested = Children.toArray(onlyNode.props.children);
    return nested.length > 1 ? nested : nodes;
}

function isPrimaryAction(node: ReactNode): boolean {
    return isValidElement<{ variant?: string }>(node) && node.props.variant === "primary";
}

function ActionOverflow({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const close = useCallback(() => setOpen(false), []);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) close();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") close();
        };
        window.addEventListener("mousedown", onPointerDown);
        window.addEventListener("touchstart", onPointerDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("touchstart", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open, close]);

    return (
        <div ref={rootRef} className="relative 2xl:hidden">
            <button
                type="button"
                aria-label="Más acciones"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className={[
                    "inline-flex size-9 items-center justify-center rounded-lg border text-[var(--text-secondary)] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30",
                    open
                        ? "border-border-medium bg-surface-2 text-foreground"
                        : "border-border-light bg-surface-1 hover:border-border-medium hover:bg-surface-2 hover:text-foreground",
                ].join(" ")}
            >
                <MoreHorizontal size={16} strokeWidth={2} />
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        role="dialog"
                        aria-label="Más acciones"
                        initial={{ opacity: 0, scale: 0.98, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: -4 }}
                        transition={{ duration: 0.12 }}
                        onClick={close}
                        className={[
                            "absolute right-0 top-full z-[var(--z-dropdown,30)] mt-2 flex min-w-[240px] origin-top-right flex-col",
                            "rounded-xl border border-border-light bg-surface-1 p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.14)]",
                            "[&>a]:!h-9 [&>a]:!w-full [&>a]:!justify-start [&>a]:!rounded-md [&>a]:!border-transparent",
                            "[&>a]:!bg-transparent [&>a]:!px-3 [&>a]:!shadow-none [&>a]:!font-sans [&>a]:!text-[13px] [&>a]:!text-foreground",
                            "[&>a]:!font-normal [&>a]:!normal-case [&>a]:!tracking-normal [&>a:hover]:!bg-surface-2 [&>a:focus-visible]:!bg-surface-2",
                            "[&>button]:!h-9 [&>button]:!w-full [&>button]:!justify-start [&>button]:!rounded-md [&>button]:!border-transparent",
                            "[&>button]:!bg-transparent [&>button]:!px-3 [&>button]:!shadow-none [&>button]:!font-sans [&>button]:!text-[13px] [&>button]:!text-foreground",
                            "[&>button]:!font-normal [&>button]:!normal-case [&>button]:!tracking-normal [&>button:hover]:!bg-surface-2 [&>button:focus-visible]:!bg-surface-2",
                            // Complex toolbar clusters have their own dropdowns and should not
                            // be nested inside the compact overflow menu.
                            "[&>div.relative]:hidden",
                            "[&>div]:w-full [&_svg]:shrink-0",
                        ].join(" ")}
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function PageHeader({
    title,
    subtitle,
    children,
    primaryAction,
    secondaryActions,
    utilityAction,
    beta: _beta = false,
    hideOverflow = false,
}: PageHeaderProps) {
    const currentBcv = useBcvRate();
    const legacyNodes = unwrapLegacyActionGroup(Children.toArray(children));
    const passiveNodes = legacyNodes.filter(isScreenReaderOnly);
    const visibleLegacyNodes = legacyNodes.filter((node) => !isScreenReaderOnly(node));
    const detectedPrimaryIndex = visibleLegacyNodes.findIndex(isPrimaryAction);
    const resolvedPrimary = primaryAction ?? (
        detectedPrimaryIndex >= 0
            ? visibleLegacyNodes[detectedPrimaryIndex]
            : visibleLegacyNodes.at(-1)
    );
    const resolvedSecondary = secondaryActions ?? (
        primaryAction
            ? children
            : visibleLegacyNodes.filter((_, index) => (
                index !== (detectedPrimaryIndex >= 0 ? detectedPrimaryIndex : visibleLegacyNodes.length - 1)
            ))
    );
    const hasSecondary = Children.count(resolvedSecondary) > 0;
    const hasOverflow = hasSecondary;
    return (
        <>
            <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-border-light bg-surface-1">
                <div className="flex h-full items-center justify-end gap-2 px-3 sm:px-4 md:px-6 xl:px-8">
                    <h1 className="sr-only">{title}</h1>

                    <div className="flex min-w-0 items-center justify-end gap-2 [&_a]:normal-case [&_a]:tracking-normal [&_a]:font-sans [&_button]:normal-case [&_button]:tracking-normal [&_button]:font-sans">
                        <div className="flex h-9 items-center overflow-hidden rounded-lg border border-border-light bg-surface-1 shadow-sm">
                            <Link
                                href="/herramientas/divisas"
                                aria-label={currentBcv
                                    ? `Tasa BCV ${currentBcv.value} bolívares, publicada el ${currentBcv.date}`
                                    : "Consultar tasa BCV"}
                                title="Tasa oficial BCV"
                                className="inline-flex h-full items-center gap-2 px-3 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-surface-2 hover:text-foreground"
                            >
                                <span className="size-1.5 rounded-full bg-primary-500" aria-hidden />
                                <span className="font-medium">BCV</span>
                                <span className="font-semibold tabular-nums text-foreground">
                                    {currentBcv?.value ?? "—"}
                                </span>
                                {currentBcv && (
                                    <span className="hidden text-[11px] text-[var(--text-tertiary)] xl:inline">
                                        {currentBcv.date}
                                    </span>
                                )}
                            </Link>
                            <span className="hidden h-4 w-px bg-border-light sm:block" aria-hidden />
                            <Link
                                href="/tools/status"
                                aria-label="Estado de portales"
                                title="Estado de portales"
                                className="hidden h-full items-center justify-center gap-1.5 px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/30 sm:inline-flex"
                            >
                                <Activity size={16} strokeWidth={1.9} />
                                <span className="hidden lg:inline">Estado</span>
                            </Link>
                            <span className="hidden h-4 w-px bg-border-light sm:block" aria-hidden />
                            <Link
                                href="/help"
                                aria-label="Ayuda"
                                title="Ayuda"
                                className="hidden h-full items-center justify-center gap-1.5 px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/30 sm:inline-flex"
                            >
                                <CircleHelp size={16} strokeWidth={1.9} />
                                <span className="hidden lg:inline">Ayuda</span>
                            </Link>
                        </div>

                        {utilityAction && <div className="min-w-0">{utilityAction}</div>}

                        {hasSecondary && (
                            <div className="hidden min-w-0 items-center gap-2 2xl:flex">
                                {resolvedSecondary}
                            </div>
                        )}
                        {hasOverflow && !hideOverflow && <ActionOverflow>{resolvedSecondary}</ActionOverflow>}
                        {resolvedPrimary && <div className="shrink-0">{resolvedPrimary}</div>}
                        {passiveNodes}
                    </div>
                </div>
            </header>

        </>
    );
}
