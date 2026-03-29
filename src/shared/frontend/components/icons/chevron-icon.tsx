"use client";

// Shared chevron icon — used in sidebar selectors and dropdowns.
// `open` rotates the chevron 180° to indicate an expanded state.

interface ChevronIconProps {
    open: boolean;
}

export function ChevronIcon({ open }: ChevronIconProps) {
    return (
        <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
            className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : "rotate-0"}`}
        >
            <path d="M2 4l3 3 3-3" />
        </svg>
    );
}
