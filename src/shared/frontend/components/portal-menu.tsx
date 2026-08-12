"use client";

// PortalMenu — dropdown/popover panel rendered into document.body via a portal.
//
// Why a portal: an inline `absolute` menu lives inside the page's stacking
// context and inside `<main overflow-y-auto>`, so it can render BEHIND the
// fixed sidebar (z-50) or get clipped by the scroll container. Rendering into
// body with `position: fixed` escapes every ancestor stacking context and
// overflow clip, so the panel is always on top and fully visible.
//
// Positioning is done imperatively via a callback ref (no setState-in-effect):
// when the panel node mounts we read the trigger's rect and set the panel's
// fixed coords before paint. The menu closes on outside click, scroll, resize
// or Escape to avoid a stale position.

import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface PortalMenuProps {
    open: boolean;
    onClose: () => void;
    /** Trigger element the panel anchors to. */
    anchorRef: RefObject<HTMLElement | null>;
    /** Horizontal edge to align the panel with the trigger. Default "right". */
    align?: "left" | "right";
    /** Gap in px between the trigger and the panel. Default 6. */
    gap?: number;
    /** Vertical side where the panel opens. "auto" chooses the side with more room. */
    side?: "top" | "bottom" | "auto";
    children: ReactNode;
    /** Extra classes for the panel container. */
    className?: string;
}

export function PortalMenu({
    open,
    onClose,
    anchorRef,
    align = "right",
    gap = 6,
    side = "bottom",
    children,
    className = "",
}: PortalMenuProps) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const openedAtRef = useRef(0);

    // Position the panel relative to the trigger the moment it mounts.
    const positionPanel = useCallback((node: HTMLDivElement | null) => {
        panelRef.current = node;
        if (!node) return;
        const el = anchorRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const viewportPadding = 8;
        const panelWidth = node.getBoundingClientRect().width;
        const panelHeight = node.getBoundingClientRect().height;
        const maxLeft = Math.max(viewportPadding, window.innerWidth - viewportPadding - panelWidth);
        const anchoredLeft = align === "right" ? r.right - panelWidth : r.left;
        const clampedLeft = Math.min(Math.max(viewportPadding, anchoredLeft), maxLeft);
        const spaceAbove = Math.max(0, r.top - gap - viewportPadding);
        const spaceBelow = Math.max(0, window.innerHeight - r.bottom - gap - viewportPadding);
        const opensAbove = side === "top" || (side === "auto" && panelHeight > spaceBelow && spaceAbove > spaceBelow);

        if (side === "auto") {
            node.style.maxHeight = `${Math.max(1, opensAbove ? spaceAbove : spaceBelow)}px`;
            node.style.overflowY = "auto";
        }

        if (opensAbove) {
            node.style.bottom = `${window.innerHeight - r.top + gap}px`;
            node.style.top = "auto";
        } else {
            node.style.top = `${r.bottom + gap}px`;
            node.style.bottom = "auto";
        }
        node.style.left = `${clampedLeft}px`;
        node.style.right = "auto";
    }, [anchorRef, align, gap, side]);

    // Close on scroll / resize / Escape — keeps the panel from drifting.
    useEffect(() => {
        if (!open) return;
        openedAtRef.current = performance.now();
        const closeOnExternalScroll = (event: Event) => {
            // Mobile browsers can emit a scroll while opening a fixed menu
            // (for example while bringing an autofocus target into view).
            // Treat that initial layout scroll as part of opening, otherwise
            // the menu disappears before the user can interact with it.
            if (performance.now() - openedAtRef.current < 250) return;
            const target = event.target;
            if (target instanceof Node && panelRef.current?.contains(target)) return;
            onClose();
        };
        const close = () => onClose();
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("scroll", closeOnExternalScroll, true);
        window.addEventListener("resize", close);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("scroll", closeOnExternalScroll, true);
            window.removeEventListener("resize", close);
            window.removeEventListener("keydown", onKey);
        };
    }, [open, onClose]);

    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <>
            <div className="fixed inset-0 z-[1000]" onClick={onClose} />
            <div
                ref={positionPanel}
                role="menu"
                className={`fixed z-[1001] rounded-xl border border-border-light bg-surface-1 shadow-lg p-1 ${className}`}
            >
                {children}
            </div>
        </>,
        document.body,
    );
}
