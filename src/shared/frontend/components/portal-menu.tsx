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

import { useCallback, useEffect, type ReactNode, type RefObject } from "react";
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
    children,
    className = "",
}: PortalMenuProps) {
    // Position the panel relative to the trigger the moment it mounts.
    const positionPanel = useCallback((node: HTMLDivElement | null) => {
        if (!node) return;
        const el = anchorRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        node.style.top = `${r.bottom + gap}px`;
        if (align === "right") {
            node.style.right = `${window.innerWidth - r.right}px`;
            node.style.left = "auto";
        } else {
            node.style.left = `${r.left}px`;
            node.style.right = "auto";
        }
    }, [anchorRef, align, gap]);

    // Close on scroll / resize / Escape — keeps the panel from drifting.
    useEffect(() => {
        if (!open) return;
        const close = () => onClose();
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("scroll", close, true);
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
