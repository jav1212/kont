"use client";

import Link from "next/link";
import { Activity, Archive, BookOpen, Briefcase, Building2, CalendarDays, BarChart3, ChevronLeft, CircleHelp, ClipboardList, Clock, Coins, CreditCard, Download, FileText, Folder, Home, KeyRound, List, LockKeyhole, Mail, Package, Percent, Search, Tag, Users, Receipt, Settings, Shield, ShoppingCart, Wrench, Truck, UserRound, Wallet, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { Breadcrumbs, type BreadcrumbItem, type BreadcrumbLinkProps } from "@kontave/ui";
import { NAVIGATION_DESTINATIONS, resolveBreadcrumbs, resolveNavigationTargetFromPath, type NavigationLabels } from "@kontave/navigation";
import { useNavigationPreferences } from "@/src/shared/frontend/components/navigation-preferences-provider";

const SEMANTIC_ICONS: Readonly<Record<string, LucideIcon>> = {
  activity: Activity, archive: Archive, book: BookOpen, briefcase: Briefcase, building: Building2,
  calendar: CalendarDays, chart: BarChart3, check: Activity, clipboard: ClipboardList, clock: Clock, coins: Coins,
  "credit-card": CreditCard, document: FileText, download: Download, folder: Folder, grid: Package, help: CircleHelp,
  home: Home, inventory: Package, key: KeyRound, list: List, lock: LockKeyhole, mail: Mail, package: Package,
  people: Users, percent: Percent, receipt: Receipt, search: Search, settings: Settings, shield: Shield, tag: Tag,
  "shopping-cart": ShoppingCart, tool: Wrench, truck: Truck, user: UserRound, wallet: Wallet,
};

/**
 * Renders the shared route hierarchy and user navigation preferences.
 * @param props - Optional entity title for a route-specific page heading.
 * @returns Accessible responsive breadcrumb navigation, or null for unrecognized and single-level routes.
 */
export function AppBreadcrumb({ pageTitle }: { readonly pageTitle?: string }) {
  const pathname = usePathname();
  const { labels, icons, ready } = useNavigationPreferences();
  if (!ready) return null;
  const target = resolveNavigationTargetFromPath(pathname);
  if (!target) return null;
  const trail = resolveBreadcrumbs(target, labels as NavigationLabels);
  if (trail.length < 2) return null;
  const items: BreadcrumbItem[] = trail.map((entry, index) => {
    const destination = NAVIGATION_DESTINATIONS.find((node) => node.id === entry.destination.id);
    const destinationPath = destination && "webPath" in destination ? destination.webPath : undefined;
    const moduleIcon = index === 1 ? SEMANTIC_ICONS[icons[entry.destination.id] ?? ""] : undefined;
    const Icon = moduleIcon;
    const label = entry.current && pageTitle ? pageTitle : entry.label;
    return {
      id: entry.destination.id,
      label,
      labelClassName: "min-w-0 truncate",
      href: entry.current ? undefined : destinationPath,
      current: entry.current,
      className: "hidden min-w-0 sm:flex",
      prefix: Icon ? <Icon aria-hidden="true" size={13} className="mr-1 shrink-0" /> : undefined,
    };
  });
  const parent = items.at(-2);
  if (!parent?.href) return null;
  const renderLink = (props: BreadcrumbLinkProps) => <Link href={props.href} title={props.title} className={`${props.className ?? ""} inline-flex min-h-6 max-w-40 min-w-0 overflow-hidden items-center rounded px-1 text-[var(--text-tertiary)] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>{props.children}</Link>;
  return (
    <div className="min-w-0 flex-1">
      <nav aria-label="Ruta de navegación" className="sm:hidden">
        <Link href={parent.href} title={parent.label} className="inline-flex min-h-6 max-w-40 min-w-0 items-center gap-1 rounded px-1 text-[var(--text-tertiary)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ChevronLeft size={14} aria-hidden="true" />
          <span className="min-w-0 truncate">{parent.label}</span>
        </Link>
      </nav>
      <Breadcrumbs
        ariaLabel="Ruta de navegación"
        className="hidden min-w-0 sm:block"
        listClassName="flex min-w-0 items-center gap-1 text-[13px]"
        items={collapseTrail(items)}
        linkComponent={renderLink}
      />
    </div>
  );
}

function collapseTrail(items: readonly BreadcrumbItem[]): readonly BreadcrumbItem[] {
  if (items.length <= 4) return items;
  const first = items[0];
  const penultimate = items.at(-2);
  const last = items.at(-1);
  if (!first || !penultimate || !last) return items;
  const hiddenItems = items.slice(1, -2);
  const overflowContent = <details className="relative">
    <summary aria-label="Mostrar niveles anteriores" title="Mostrar niveles anteriores" className="inline-flex min-h-6 min-w-6 cursor-pointer list-none items-center justify-center rounded px-1 text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">…</summary>
    <ul className="absolute left-0 top-full z-30 mt-1 min-w-44 rounded-md border border-border-light bg-surface-1 p-1 shadow-lg">
      {hiddenItems.map((item) => <li key={item.id}>{item.href ? <Link href={item.href} className="block min-h-6 rounded px-2 py-1 text-[13px] text-foreground hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{item.label}</Link> : <span className="block px-2 py-1 text-[13px] text-foreground">{item.label}</span>}</li>)}
    </ul>
  </details>;
  return [first, { id: "breadcrumb-ellipsis", label: "…", current: false, className: "hidden sm:flex", overflowContent }, penultimate, last];
}
