import type { HTMLAttributes } from "react";

// ── LogoFull ──────────────────────────────────────────────────────────────────
// Renders the full "kontave." wordmark using HTML + Tailwind only.
//
// Props:
//   size      — font-size in pixels (default 20). Controls the rendered size
//               of the entire wordmark. Equivalent to the old SVG size prop.
//   className — forwarded to the outer wrapper. Use text-foreground (default)
//               or text-sidebar-fg for dark sidebar contexts.

interface LogoFullProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
    size?: number;
}

export function LogoFull({ size = 30, className, style, ...rest }: LogoFullProps) {
    return (
        <span
            role="img"
            aria-label="Kontave"
            className={[
                "inline-flex items-end leading-none select-none",
                "font-sans font-black tracking-[-0.03em]",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            style={{ fontSize: size, lineHeight: 1, ...style }}
            {...rest}
        >
            {/* Wordmark — inherits currentColor from className (e.g. text-foreground) */}
            <span>kontave</span>
            {/* Orange dot — brand accent, hardcoded #FF4A18 intentionally.
                The Tailwind token text-primary-500 resolves to #D93A10 (WCAG-safe
                dark orange) in light mode — not the raw brand orange. */}
            <span style={{ color: "#FF4A18" }}>.</span>
        </span>
    );
}

// ── LogoMark ──────────────────────────────────────────────────────────────────
// Compact monogram: "k." — for collapsed sidebars, favicons, tight spaces.
// API identical to LogoFull.

interface LogoMarkProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
    size?: number;
}

export function LogoMark({ size = 30, className, style, ...rest }: LogoMarkProps) {
    return (
        <span
            role="img"
            aria-label="Kontave"
            className={[
                "inline-flex items-end leading-none select-none",
                "font-sans font-black tracking-[-0.03em]",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            style={{ fontSize: size, lineHeight: 1, ...style }}
            {...rest}
        >
            <span>k</span>
            <span style={{ color: "#FF4A18" }}>.</span>
        </span>
    );
}
