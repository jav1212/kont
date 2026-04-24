"use client";

// SidebarSubnav — renders the sub-navigation items for the currently active module.
// Architecture: pure presentation; receives pre-filtered items and current pathname.
// Constraint: must not contain module-selection logic — that belongs in AppSidebar.

import Link from "next/link";
import type { SubNavItem } from "@/src/shared/frontend/navigation";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { useUrlContext } from "@/src/shared/frontend/hooks/use-url-context";

// ── ActiveBar — 2 px orange left edge on the active subnav item ───────────────

function ActiveBar({ visible }: { visible: boolean }) {
    if (!visible) return null;
    return (
        <span
            aria-hidden="true"
            className="absolute left-0 inset-y-0 w-0.5 rounded-full bg-sidebar-active-fg"
        />
    );
}

// ── Connecting-line indicator (Tree style) ────────────────────────────────────
// Fixed vertical line with horizontal branches for each item.

function SubnavIndicator({ isLast }: { isLast?: boolean }) {
    return (
        <div className="relative w-4 h-full flex items-center justify-center shrink-0">
            {/* Vertical connector segment */}
            <div className={[
                "absolute left-0 w-px bg-sidebar-border/60",
                isLast ? "top-0 h-1/2" : "inset-y-0"
            ].join(" ")} />
            
            {/* Horizontal branch */}
            <div className="absolute left-0 top-1/2 w-3 h-px bg-sidebar-border/60" />

            {/* In the requested design, the active sub-item doesn't have a special pointer,
                but we can keep the vertical bar on the right via the parent container or
                at least remove the red dot here. */}
        </div>
    );
}

// `overflow-hidden` is required for the absolute-positioned ActiveBar.
// `border` lives in the base so both states stay layout-stable (no reflow on hover/active).
const ITEM_BASE   = `group relative overflow-hidden flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-colors duration-150 font-mono ${APP_SIZES.nav.subItem}`;
const ITEM_IDLE   = "text-sidebar-fg border-transparent hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border";
// Full token, no /40 wash, with warm border for solid affordance.
const ITEM_ACTIVE = "text-sidebar-active-fg bg-sidebar-active-bg border-sidebar-active-border shadow-sm";

interface SidebarSubnavProps {
    subnav: SubNavItem[];
    pathname: string;
}

export function SidebarSubnav({ subnav, pathname }: SidebarSubnavProps) {
    const { buildContextHref } = useUrlContext();

    if (subnav.length === 0) return null;

    const seenGroups = new Set<string>();

    return (
        <div className="flex flex-col gap-0.5 ml-4 border-l-0">
            {subnav.map(({ href, label, group }, index) => {
                const isActive  = pathname === href;
                const showGroup = group && !seenGroups.has(group) && (() => { seenGroups.add(group); return true; })();
                const isLast    = index === subnav.length - 1;

                return (
                    <div key={href} className="flex flex-col">
                        {showGroup && (
                            <p className={`px-3 pt-4 pb-1 font-mono ${APP_SIZES.nav.group} text-sidebar-label`}>
                                {group}
                            </p>
                        )}
                        <Link
                            href={buildContextHref(href)}
                            aria-current={isActive ? "page" : undefined}
                            className={[ITEM_BASE, isActive ? ITEM_ACTIVE : ITEM_IDLE].join(" ")}
                        >
                            <ActiveBar visible={isActive} />
                            <SubnavIndicator isLast={isLast} />
                            <span className="truncate flex-1">{label}</span>
                        </Link>
                    </div>
                );
            })}
        </div>
    );
}
