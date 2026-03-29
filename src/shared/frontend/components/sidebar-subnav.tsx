"use client";

// SidebarSubnav — renders the sub-navigation items for the currently active module.
// Architecture: pure presentation; receives pre-filtered items and current pathname.
// Constraint: must not contain module-selection logic — that belongs in AppSidebar.

import Link from "next/link";
import type { SubNavItem } from "@/src/shared/frontend/navigation";
import { APP_SIZES } from "@/src/shared/frontend/sizes";

// ── Connecting-line indicator (Financo style) ──────────────────────────────────
// Active: short vertical bar. Inactive: horizontal dash.

function SubnavIndicator({ active }: { active: boolean }) {
    return active ? (
        <span aria-hidden="true" className="shrink-0 w-0.5 h-3 rounded-full bg-sidebar-active-fg" />
    ) : (
        <span aria-hidden="true" className="shrink-0 w-2 h-px bg-sidebar-border" />
    );
}

const ITEM_BASE   = `relative flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors duration-150 font-mono ${APP_SIZES.nav.subItem}`;
const ITEM_IDLE   = "text-sidebar-fg hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border";
const ITEM_ACTIVE = "text-sidebar-active-fg bg-sidebar-active-bg/60";

interface SidebarSubnavProps {
    subnav: SubNavItem[];
    pathname: string;
}

export function SidebarSubnav({ subnav, pathname }: SidebarSubnavProps) {
    if (subnav.length === 0) return null;

    const seenGroups = new Set<string>();

    return (
        <>
            {subnav.map(({ href, label, group }) => {
                const isActive  = pathname === href;
                const showGroup = group && !seenGroups.has(group) && (() => { seenGroups.add(group); return true; })();

                return (
                    <div key={href}>
                        {showGroup && (
                            <p className={`px-3 pt-3 pb-1 font-mono ${APP_SIZES.nav.group} uppercase text-sidebar-label`}>
                                {group}
                            </p>
                        )}
                        <Link
                            href={href}
                            aria-current={isActive ? "page" : undefined}
                            className={[ITEM_BASE, isActive ? ITEM_ACTIVE : ITEM_IDLE].join(" ")}
                        >
                            <SubnavIndicator active={isActive} />
                            {label}
                        </Link>
                    </div>
                );
            })}
        </>
    );
}
