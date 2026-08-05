"use client";

// SidebarSubnav — renders the sub-navigation items for the currently active module.
// Architecture: pure presentation; receives pre-filtered items and current pathname.
// Constraint: must not contain module-selection logic — that belongs in AppSidebar.
//
// Visual hierarchy (no tree connectors per REQ-013):
//   ROOT items (no `group`)        → strong:  pl-3, font-medium, text-fg-hover
//   GROUP boundaries               → subtle divider, without redundant labels
//   SUBITEMS (with `group`)        → tenue:   pl-7, normal weight, text-fg base
//   ACTIVE (any depth)             → bg-warm + fg-warm + 2px ActiveBar at left:0
//
// The ActiveBar lives flush with the sidebar's left rule regardless of indent —
// it answers "where am I in the list", which is independent of the item's depth.

import Link from "next/link";
import {
    Activity,
    Archive,
    ArrowUpFromLine,
    BadgePercent,
    BarChart3,
    BookOpen,
    Boxes,
    Calculator,
    CalendarDays,
    CalendarRange,
    CircleDot,
    ClipboardList,
    DollarSign,
    FileText,
    FolderOpen,
    HandCoins,
    History,
    LayoutDashboard,
    ListTree,
    Package,
    Plug,
    ReceiptText,
    RefreshCcw,
    Scale,
    ScrollText,
    Settings,
    TreePalm,
    Truck,
    UserMinus,
    UserRound,
    Users,
    WalletCards,
    type LucideIcon,
} from "lucide-react";
import type { SubNavItem } from "@/src/shared/frontend/navigation";
import { useUrlContext } from "@/src/shared/frontend/hooks/use-url-context";
import { BetaBadge } from "@/src/shared/frontend/components/beta-badge";

// ── ActiveBar — 2 px orange left edge, always flush with the sidebar gutter ──

function ActiveBar({ visible }: { visible: boolean }) {
    if (!visible) return null;
    return (
        <span
            aria-hidden="true"
            className="absolute left-0 inset-y-1.5 w-0.5 rounded-r-full bg-sidebar-active-fg"
        />
    );
}

// ── Item style strata ─────────────────────────────────────────────────────────
// `overflow-hidden` is required for the absolute-positioned ActiveBar.
// Active state collapses to a single visual stack (bar + bg + fg + weight) —
// the previous design layered 4 markers (bar + border + bg + shadow) which was
// over-marked.

const ITEM_BASE = `group relative overflow-hidden flex items-center gap-2.5 rounded-lg transition-colors duration-150 font-sans text-[15px] leading-tight`;

// Root items: prominent, slightly taller. The default "you can go here" surface.
const ROOT_IDLE   = "pl-3 pr-3 py-2.5 font-semibold text-sidebar-fg-hover hover:bg-sidebar-bg-hover/70";
const ROOT_ACTIVE = "pl-3 pr-3 py-2.5 font-bold text-sidebar-active-fg bg-sidebar-active-bg";

// Subitems: indented under their group, lighter color, denser. Reads as "child of".
const SUB_IDLE    = "pl-3 pr-3 py-2 font-medium text-sidebar-fg hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover/70";
const SUB_ACTIVE  = "pl-3 pr-3 py-2 font-semibold text-sidebar-active-fg bg-sidebar-active-bg";

const FOCUS_RING  = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border";

const NAV_ITEM_ICONS: Record<string, LucideIcon> = {
    "/payroll/tablero": LayoutDashboard,
    "/payroll/employees": Users,
    "/payroll/settings": Settings,
    "/payroll": Calculator,
    "/payroll/vacations": TreePalm,
    "/payroll/profit-sharing": BadgePercent,
    "/payroll/social-benefits": HandCoins,
    "/payroll/liquidations": UserMinus,
    "/payroll/ari": FileText,
    "/payroll/history": History,
    "/documents": LayoutDashboard,
    "/documents/files": FolderOpen,
    "/documents/contracts": ScrollText,
    "/purchases": LayoutDashboard,
    "/purchases/suppliers": Truck,
    "/purchases/archive": Archive,
    "/sales": LayoutDashboard,
    "/sales/customers": UserRound,
    "/sales/archive": Archive,
    "/sales/igtf-fortnightly": ReceiptText,
    "/inventory": LayoutDashboard,
    "/inventory/products": Package,
    "/inventory/departments": Boxes,
    "/inventory/sales": ArrowUpFromLine,
    "/inventory/operations": RefreshCcw,
    "/inventory/compras-pendientes": History,
    "/inventory/purchase-ledger": BookOpen,
    "/inventory/sales-ledger": BookOpen,
    "/inventory/inventory-ledger": ClipboardList,
    "/inventory/report": BarChart3,
    "/inventory/balance-report": Scale,
    "/inventory/islr-report": FileText,
    "/accounting": LayoutDashboard,
    "/accounting/charts": ListTree,
    "/accounting/accounts": WalletCards,
    "/accounting/periods": CalendarRange,
    "/accounting/integrations": Plug,
    "/accounting/journal": BookOpen,
    "/accounting/trial-balance": Scale,
    "/accounting/financial-statements": BarChart3,
    "/tools": LayoutDashboard,
    "/tools/divisas": DollarSign,
    "/tools/calendario-seniat": CalendarDays,
    "/tools/status": Activity,
};

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
                const Icon      = NAV_ITEM_ICONS[href] ?? CircleDot;
                const showGroup = group && !seenGroups.has(group) && (() => { seenGroups.add(group); return true; })();

                // A group's first item gets a divider; subsequent items remain dense.
                const tone = isRoot
                    ? (isActive ? ROOT_ACTIVE : ROOT_IDLE)
                    : (isActive ? SUB_ACTIVE  : SUB_IDLE);

                return (
                    <div key={href} className="flex flex-col">
                        {showGroup && (
                            <div
                                aria-hidden="true"
                                className={[
                                    "mx-2 border-t border-sidebar-border",
                                    idx === 0 ? "mt-1 pt-1" : "mt-2 pt-1",
                                ].join(" ")}
                            />
                        )}
                        <Link
                            href={buildContextHref(href)}
                            aria-current={isActive ? "page" : undefined}
                            className={[ITEM_BASE, tone, FOCUS_RING].join(" ")}
                        >
                            <ActiveBar visible={isActive} />
                            <span
                                aria-hidden="true"
                                className={[
                                    "w-4 h-4 shrink-0 flex items-center justify-center",
                                    isActive ? "text-sidebar-active-fg" : "text-sidebar-label group-hover:text-sidebar-fg-hover",
                                ].join(" ")}
                            >
                                <Icon size={16} strokeWidth={1.75} />
                            </span>
                            <span className="truncate flex-1">{label}</span>
                            {beta && <BetaBadge />}
                        </Link>
                    </div>
                );
            })}
        </div>
    );
}
