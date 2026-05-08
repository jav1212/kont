"use client";

// SidebarSubnav — renders the sub-navigation items for the currently active module.
// Architecture: pure presentation; receives pre-filtered items and current pathname.
// Constraint: must not contain module-selection logic — that belongs in AppSidebar.
//
// Visual hierarchy (no tree connectors per REQ-013):
//   ROOT items (no `group`)        → strong:  pl-3, font-medium, text-fg-hover
//   GROUP labels                   → chrome:  outdented (px-1), small uppercase
//   SUBITEMS (with `group`)        → tenue:   pl-7, normal weight, text-fg base
//   ACTIVE (any depth)             → bg-warm + fg-warm + 2px ActiveBar at left:0
//
// The ActiveBar lives flush with the sidebar's left rule regardless of indent —
// it answers "where am I in the list", which is independent of the item's depth.

import Link from "next/link";
import type { SubNavItem } from "@/src/shared/frontend/navigation";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { useUrlContext } from "@/src/shared/frontend/hooks/use-url-context";
import { BetaBadge } from "@/src/shared/frontend/components/beta-badge";

// ── ActiveBar — 2 px orange left edge, always flush with the sidebar gutter ──

function ActiveBar({ visible }: { visible: boolean }) {
    if (!visible) return null;
    return (
        <span
            aria-hidden="true"
            className="absolute left-0 inset-y-0 w-0.5 rounded-full bg-sidebar-active-fg"
        />
    );
}

// ── Item style strata ─────────────────────────────────────────────────────────
// `overflow-hidden` is required for the absolute-positioned ActiveBar.
// Active state collapses to a single visual stack (bar + bg + fg + weight) —
// the previous design layered 4 markers (bar + border + bg + shadow) which was
// over-marked.

const ITEM_BASE = `group relative overflow-hidden flex items-center gap-2.5 rounded-lg transition-colors duration-150 font-mono ${APP_SIZES.nav.subItem}`;

// Root items: prominent, slightly taller. The default "you can go here" surface.
const ROOT_IDLE   = "pl-3 pr-3 py-2 font-medium text-sidebar-fg-hover hover:bg-sidebar-bg-hover/70";
const ROOT_ACTIVE = "pl-3 pr-3 py-2 font-semibold text-sidebar-active-fg bg-sidebar-active-bg";

// Subitems: indented under their group, lighter color, denser. Reads as "child of".
const SUB_IDLE    = "pl-7 pr-3 py-1.5 text-sidebar-fg hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover/70";
const SUB_ACTIVE  = "pl-7 pr-3 py-1.5 font-medium text-sidebar-active-fg bg-sidebar-active-bg";

const FOCUS_RING  = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border";

interface SidebarSubnavProps {
    subnav: SubNavItem[];
    pathname: string;
}

export function SidebarSubnav({ subnav, pathname }: SidebarSubnavProps) {
    const { buildContextHref } = useUrlContext();

    if (subnav.length === 0) return null;

    const seenGroups = new Set<string>();

    return (
        <div className="flex flex-col">
            {subnav.map(({ href, label, group, beta }, idx) => {
                const isActive  = pathname === href;
                const isRoot    = !group;
                const showGroup = group && !seenGroups.has(group) && (() => { seenGroups.add(group); return true; })();

                // First subitem of a new group inherits the group label's spacing — no
                // need for an extra mt; the group's pt-3 already lifts it. Subsequent
                // subitems sit tight (gap 1px via py).
                const tone = isRoot
                    ? (isActive ? ROOT_ACTIVE : ROOT_IDLE)
                    : (isActive ? SUB_ACTIVE  : SUB_IDLE);

                return (
                    <div key={href} className="flex flex-col">
                        {showGroup && (
                            <p
                                className={[
                                    "px-1 pb-1 font-mono text-sidebar-label/70",
                                    APP_SIZES.nav.group,
                                    // Generous lift above the first group, modest between groups.
                                    idx === 0 ? "pt-1" : "pt-4",
                                ].join(" ")}
                            >
                                {group}
                            </p>
                        )}
                        <Link
                            href={buildContextHref(href)}
                            aria-current={isActive ? "page" : undefined}
                            className={[ITEM_BASE, tone, FOCUS_RING].join(" ")}
                        >
                            <ActiveBar visible={isActive} />
                            <span className="truncate flex-1">{label}</span>
                            {beta && <BetaBadge />}
                        </Link>
                    </div>
                );
            })}
        </div>
    );
}
