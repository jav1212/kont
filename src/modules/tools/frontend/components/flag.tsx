"use client";

import { JSX } from "react";

interface Props {
    /** ISO 3166-1 alpha-2 country code — e.g. "US", "EU", "VE". */
    code: string;
    /** Height in px. Width is calculated with 4:3 aspect ratio. Default 16. */
    size?: number;
    className?: string;
}

/**
 * Inline SVG flag component — renders consistently across OS (Windows, macOS, Linux)
 * without depending on font-level flag glyphs (which Windows does not ship).
 *
 * Flags are intentionally simplified (rectangles + key identifiers) — the goal is
 * identification at small sizes, not heraldic accuracy. All flags respect a 4:3
 * aspect ratio and share the same rounded-sm + border treatment for visual parity.
 *
 * Supported: US, EU, CN, GB, JP, CA, MX, BR, AE, TR, RU, VE.
 * Unknown codes fall back to a neutral 2-letter ISO chip.
 */
export function Flag({ code, size = 16, className }: Props) {
    const width = Math.round((size * 4) / 3);
    const renderer = FLAG_RENDERERS[code.toUpperCase()];

    const wrapperCls = [
        "inline-block overflow-hidden rounded-sm border border-border-light shrink-0",
        className ?? "",
    ].join(" ").trim();

    if (!renderer) {
        // Unknown code → neutral chip with the ISO letters.
        return (
            <span
                aria-hidden
                className={[
                    "inline-flex items-center justify-center shrink-0 rounded-sm",
                    "bg-surface-2 text-foreground/60 font-mono font-bold",
                    className ?? "",
                ].join(" ").trim()}
                style={{
                    width,
                    height: size,
                    fontSize: Math.max(6, Math.floor(size * 0.5)),
                    letterSpacing: "-0.02em",
                }}
            >
                {code.slice(0, 2).toUpperCase()}
            </span>
        );
    }

    return (
        <span
            aria-hidden
            className={wrapperCls}
            style={{ width, height: size, lineHeight: 0 }}
        >
            {renderer({ w: width, h: size })}
        </span>
    );
}

// ── Flag SVG renderers ──────────────────────────────────────────────────────
// Each renderer returns a <svg> at (0 0 60 45). We keep a uniform viewBox so
// strokes and proportions look consistent when scaled.

interface SvgArgs { w: number; h: number }

const vb = "0 0 60 45";

const FLAG_RENDERERS: Record<string, (a: SvgArgs) => JSX.Element> = {
    US: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            {/* 13 horizontal stripes — draw 7 red, leave white as background */}
            <rect width="60" height="45" fill="#ffffff" />
            {[0, 2, 4, 6, 8, 10, 12].map((i) => (
                <rect
                    key={i}
                    x="0"
                    y={(i * 45) / 13}
                    width="60"
                    height={45 / 13}
                    fill="#B22234"
                />
            ))}
            {/* Canton */}
            <rect x="0" y="0" width="24" height={(45 * 7) / 13} fill="#3C3B6E" />
            {/* Simplified stars — small dots in a grid */}
            {[0, 1, 2, 3].map((row) =>
                [0, 1, 2, 3, 4].map((col) => (
                    <circle
                        key={`${row}-${col}`}
                        cx={2.4 + col * 4.6}
                        cy={2 + row * 5.6}
                        r="0.9"
                        fill="#ffffff"
                    />
                ))
            )}
        </svg>
    ),

    EU: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            <rect width="60" height="45" fill="#003399" />
            {/* 12 stars in a circle — simplified as small dots */}
            {Array.from({ length: 12 }).map((_, i) => {
                const angle = (i * Math.PI * 2) / 12 - Math.PI / 2;
                const cx = 30 + Math.cos(angle) * 11;
                const cy = 22.5 + Math.sin(angle) * 11;
                return <circle key={i} cx={cx} cy={cy} r="1.6" fill="#FFCC00" />;
            })}
        </svg>
    ),

    CN: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            <rect width="60" height="45" fill="#DE2910" />
            {/* Large star top-left */}
            <Star cx={11} cy={11} r={4.2} fill="#FFDE00" />
            {/* 4 small stars — simplified as dots near the big one */}
            <circle cx="20" cy="5" r="1.1" fill="#FFDE00" />
            <circle cx="24" cy="10" r="1.1" fill="#FFDE00" />
            <circle cx="24" cy="16" r="1.1" fill="#FFDE00" />
            <circle cx="20" cy="21" r="1.1" fill="#FFDE00" />
        </svg>
    ),

    GB: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            <rect width="60" height="45" fill="#012169" />
            {/* White diagonals */}
            <path d="M0,0 L60,45 M60,0 L0,45" stroke="#ffffff" strokeWidth="9" />
            {/* Red diagonals (narrower, offset) */}
            <path d="M0,0 L60,45" stroke="#C8102E" strokeWidth="3" />
            <path d="M60,0 L0,45" stroke="#C8102E" strokeWidth="3" />
            {/* White cross */}
            <rect x="25" y="0" width="10" height="45" fill="#ffffff" />
            <rect x="0" y="17.5" width="60" height="10" fill="#ffffff" />
            {/* Red cross */}
            <rect x="27" y="0" width="6" height="45" fill="#C8102E" />
            <rect x="0" y="19.5" width="60" height="6" fill="#C8102E" />
        </svg>
    ),

    JP: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            <rect width="60" height="45" fill="#ffffff" />
            <circle cx="30" cy="22.5" r="13.5" fill="#BC002D" />
        </svg>
    ),

    CA: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            <rect width="60" height="45" fill="#ffffff" />
            <rect x="0" y="0" width="15" height="45" fill="#D52B1E" />
            <rect x="45" y="0" width="15" height="45" fill="#D52B1E" />
            {/* Simplified maple leaf — stylized diamond */}
            <path
                d="M30 11 L33 18 L40 18 L34 22 L36 29 L30 25 L24 29 L26 22 L20 18 L27 18 Z"
                fill="#D52B1E"
            />
        </svg>
    ),

    MX: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            <rect width="20" height="45" fill="#006847" />
            <rect x="20" width="20" height="45" fill="#ffffff" />
            <rect x="40" width="20" height="45" fill="#CE1126" />
            {/* Central emblem simplified as a small circle */}
            <circle cx="30" cy="22.5" r="4" fill="#8F4E00" opacity="0.7" />
        </svg>
    ),

    BR: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            <rect width="60" height="45" fill="#009B3A" />
            {/* Yellow rhombus */}
            <path d="M30 5 L55 22.5 L30 40 L5 22.5 Z" fill="#FEDF00" />
            {/* Blue disc */}
            <circle cx="30" cy="22.5" r="8.5" fill="#002776" />
        </svg>
    ),

    AE: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            {/* Vertical red bar (hoist) */}
            <rect x="0" y="0" width="15" height="45" fill="#EF3340" />
            {/* 3 horizontal bands */}
            <rect x="15" y="0" width="45" height="15" fill="#00843D" />
            <rect x="15" y="15" width="45" height="15" fill="#ffffff" />
            <rect x="15" y="30" width="45" height="15" fill="#000000" />
        </svg>
    ),

    TR: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            <rect width="60" height="45" fill="#E30A17" />
            <circle cx="23" cy="22.5" r="9" fill="#ffffff" />
            <circle cx="25.5" cy="22.5" r="7.2" fill="#E30A17" />
            {/* Star (simplified as 5-point) */}
            <Star cx={34} cy={22.5} r={3.8} fill="#ffffff" />
        </svg>
    ),

    RU: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            <rect x="0" y="0"  width="60" height="15" fill="#ffffff" />
            <rect x="0" y="15" width="60" height="15" fill="#0039A6" />
            <rect x="0" y="30" width="60" height="15" fill="#D52B1E" />
        </svg>
    ),

    VE: () => (
        <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="none">
            <rect x="0" y="0"  width="60" height="15" fill="#FFCC00" />
            <rect x="0" y="15" width="60" height="15" fill="#00247D" />
            <rect x="0" y="30" width="60" height="15" fill="#CF142B" />
            {/* 8 stars in arc on the blue band */}
            {Array.from({ length: 8 }).map((_, i) => {
                const angle = Math.PI + (i * Math.PI) / 7;
                const cx = 30 + Math.cos(angle) * 13;
                const cy = 22.5 + 6 + Math.sin(angle) * 5;
                return <circle key={i} cx={cx} cy={cy} r="0.85" fill="#ffffff" />;
            })}
        </svg>
    ),
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function Star({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
    // 5-pointed star built from polar coordinates.
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? r : r * 0.42;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return <polygon points={points.join(" ")} fill={fill} />;
}
