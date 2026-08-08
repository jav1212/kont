"use client";

// AppSidebar — single-column navigation shell.
// Desktop stays compact and labelled; mobile reuses the same hierarchy as a drawer.

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Activity,
    Check,
    CircleHelp,
    CreditCard,
    LifeBuoy,
    LogOut,
    Moon,
    Settings,
    Sun,
    UserRound,
    X,
} from "lucide-react";
import { APP_MODULES, MODULE_SUBNAV } from "@/src/shared/frontend/navigation";
import { useIsDesktop } from "@/src/shared/frontend/hooks/use-is-desktop";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { useTheme } from "@/src/shared/frontend/components/theme-provider";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useModuleAccess, usePlanName } from "@/src/modules/billing/frontend/hooks/use-module-access";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import { LogoFull } from "@/src/shared/frontend/components/logo";
import { useProfile } from "@/src/shared/frontend/hooks/use-profile";
import { SidebarCompanySelector } from "@/src/shared/frontend/components/sidebar-company-selector";
import { SidebarModuleSelector } from "@/src/shared/frontend/components/sidebar-module-selector";
import { SidebarSubnav } from "@/src/shared/frontend/components/sidebar-subnav";
import { SidebarUpdateBanner } from "@/src/shared/frontend/components/sidebar-update-banner";
import { PortalMenu } from "@/src/shared/frontend/components/portal-menu";
import { useUrlContext } from "@/src/shared/frontend/hooks/use-url-context";

// ── Storage keys ──────────────────────────────────────────────────────────────

const STORAGE_MODULE    = "sidebar-module";

// ── Size constants ────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 280;

// ── Small helpers ─────────────────────────────────────────────────────────────

const MONTHS_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function currentQuincenaLabel(d: Date = new Date()): string {
    const q     = d.getDate() <= 15 ? "Quincena 1" : "Quincena 2";
    const month = MONTHS_ES[d.getMonth()];
    return `${q} · ${month} ${d.getFullYear()}`;
}

function buildModuleSubtitle(moduleId: string | null, planName?: string | null): string | null {
    switch (moduleId) {
        case "payroll":     return currentQuincenaLabel();
        case "purchases":   return "Facturas · Proveedores · Retenciones";
        case "sales":       return "Facturas · Clientes · IGTF";
        case "inventory":   return "Productos · Movimientos";
        case "accounting":  return "Libro diario";
        case "companies":   return "Directorio";
        case "documents":   return "Archivos y contratos";
        case "tools":       return "BCV · SENIAT";
        case "billing":     return planName ?? "Suscripción";
        default:            return null;
    }
}

function sentenceCase(value: string): string {
    const normalized = value.trim().toLocaleLowerCase("es");
    return normalized ? normalized[0].toLocaleUpperCase("es") + normalized.slice(1) : value;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface AppSidebarProps {
    open: boolean;
    onClose: () => void;
}

export function AppSidebar({ open, onClose }: AppSidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const isDesktop = useIsDesktop();

    const { signOut } = useAuth();
    useTheme();
    const { companies, companyId, selectCompany, loading: companyLoading } = useCompany();
    const { hasAccess: hasInventory  } = useModuleAccess("inventory");
    const { hasAccess: hasPayroll    } = useModuleAccess("payroll");
    const { hasAccess: hasAccounting } = useModuleAccess("accounting");
    useActiveTenantContext();
    const { buildContextHref } = useUrlContext();
    const { profile, email: userEmail } = useProfile();
    const planName = usePlanName();
    // ── Module selection ──────────────────────────────────────────────────────
    const [storedModuleId, setStoredModuleId] = useState<string | null>(null);

    const derivedModuleId = useMemo(() => {
        const match = APP_MODULES.find((mod) => {
            const base = "/" + mod.href.split("/").filter(Boolean)[0];
            return pathname.startsWith(base);
        });
        return match?.id ?? null;
    }, [pathname]);

    const resolvedModuleId = derivedModuleId ?? storedModuleId;
    const subnav = resolvedModuleId ? MODULE_SUBNAV[resolvedModuleId] : undefined;

    // `purchases` hereda el acceso de `inventory` por ahora — mismo plan,
    // mismas tablas (inventario_facturas_compra, inventario_proveedores). Si
    // más adelante se separa la suscripción se reemplaza por su propio slug.
    const paidAccess: Record<string, boolean> = {
        payroll: hasPayroll,
        inventory: hasInventory,
        purchases: hasInventory,
        sales:     hasInventory,   // shares plan with inventory until billed separately
        accounting: hasAccounting,
    };

    const selectableModules = useMemo(() =>
        APP_MODULES
            .filter((mod) => {
                if ("parentId" in mod) return false;
                if (mod.paid && !paidAccess[mod.id]) return false;
                return true;
            })
            .map((mod) => ({ id: mod.id, label: mod.label, href: mod.href })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hasPayroll, hasInventory, hasAccounting]);

    function handleSelectModule(id: string, href: string) {
        setStoredModuleId(id);
        localStorage.setItem(STORAGE_MODULE, id);
        router.push(buildContextHref(href));
    }

    useEffect(() => {
        const savedModule = localStorage.getItem(STORAGE_MODULE);
        if (savedModule !== null) setStoredModuleId(savedModule);
    }, []);

    // ── Drawer auto-close on route change (mobile) ────────────────────────────
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });
    useEffect(() => { onCloseRef.current(); }, [pathname]);

    async function handleSignOut() {
        await signOut();
        router.replace("/sign-in");
    }

    // ── Render ────────────────────────────────────────────────────────────────

    const moduleSubtitle = buildModuleSubtitle(resolvedModuleId, planName);

    return (
        <aside
            aria-label="Navegación principal"
            style={isDesktop ? { width: SIDEBAR_WIDTH } : undefined}
            className={[
                "flex-shrink-0 flex flex-col bg-sidebar-bg border-r border-sidebar-border overflow-visible",
                "fixed inset-y-0 left-0 z-50 w-[min(320px,calc(100vw-24px))] transition-transform duration-300 ease-in-out",
                open ? "translate-x-0" : "-translate-x-full",
                "xl:relative xl:inset-auto xl:z-auto xl:translate-x-0",
            ].join(" ")}
        >
            <header
                style={{ paddingTop: "env(safe-area-inset-top)" }}
                className="h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 px-4 xl:px-5 flex items-center justify-between border-b border-sidebar-border"
            >
                <LogoFull size={25} className="text-sidebar-fg-hover" />
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar navegación"
                    className="xl:hidden w-9 h-9 inline-flex items-center justify-center rounded-lg text-sidebar-label hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
                >
                    <X size={19} />
                </button>
            </header>

            <div className="px-3 py-3 border-b border-sidebar-border flex flex-col gap-2">
                <SidebarModuleSelector
                    modules={selectableModules}
                    activeModuleId={resolvedModuleId}
                    onSelect={handleSelectModule}
                    subtitle={moduleSubtitle}
                />
                <SidebarCompanySelector
                    companies={companies}
                    selectedId={companyId}
                    loading={companyLoading}
                    onSelect={selectCompany}
                    companiesHref={buildContextHref("/companies")}
                />
            </div>

            <nav
                className="flex-1 min-h-0 px-3 pt-3 pb-5 overflow-y-auto"
                style={{ scrollbarGutter: "stable" }}
                aria-label="Secciones del módulo"
            >
                <SidebarSubnav subnav={subnav ?? []} pathname={pathname} />
            </nav>

            <div
                style={{ paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom))" }}
                className="px-3 pt-3 border-t border-sidebar-border flex flex-col gap-2"
            >
                <SidebarUpdateBanner />
                <div className="flex flex-col gap-0.5">
                    <UtilityShortcut
                        href={buildContextHref("/settings/members")}
                        active={pathname.startsWith("/settings")}
                        label="Configuración"
                        icon={<Settings size={17} strokeWidth={1.8} />}
                    />
                    <UtilityShortcut
                        href={buildContextHref("/help")}
                        active={pathname.startsWith("/help")}
                        label="Ayuda"
                        icon={<CircleHelp size={17} strokeWidth={1.8} />}
                    />
                </div>
                <AccountCard
                    email={userEmail}
                    name={profile?.name}
                    avatarUrl={profile?.avatarUrl}
                    planName={planName}
                    onSignOut={handleSignOut}
                    profileHref={buildContextHref("/profile")}
                    helpHref={buildContextHref("/help")}
                    statusHref={buildContextHref("/tools/status")}
                    billingHref={buildContextHref("/settings/billing")}
                />
            </div>
        </aside>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// UtilityShortcut — Config / Help rows
// ────────────────────────────────────────────────────────────────────────────

function UtilityShortcut({ href, active, label, icon }: { href: string; active: boolean; label: string; icon: React.ReactNode }) {
    return (
        <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
                "group flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors duration-150",
                "font-sans text-[15px] font-semibold",
                active
                    ? "text-sidebar-active-fg bg-sidebar-active-bg/60"
                    : "text-sidebar-fg hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover",
            ].join(" ")}
        >
            <span className="shrink-0 w-5 h-5 flex items-center justify-center text-sidebar-label group-hover:text-sidebar-fg-hover">
                {icon}
            </span>
            <span>{label}</span>
        </Link>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// AccountCard — bottom card: avatar + status dot + email + double chevrons
// ────────────────────────────────────────────────────────────────────────────

interface AccountCardProps {
    email?:       string | null;
    name?:        string | null;
    avatarUrl?:   string | null;
    planName?:    string | null;
    onSignOut:    () => void | Promise<void>;
    profileHref:  string;
    helpHref:     string;
    statusHref:   string;
    billingHref:  string;
}

function AccountCard({ email, name, avatarUrl, planName, onSignOut, profileHref, helpHref, statusHref, billingHref }: AccountCardProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const { allTenants, activeTenantId, switchTenant } = useActiveTenantContext();
    const router = useRouter();

    const initial = (name?.[0] ?? email?.[0] ?? "?").toUpperCase();
    const displayName = name ?? email?.split("@")[0] ?? "Usuario";

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                aria-label={`Cuenta: ${displayName}. Abrir menú`}
                aria-expanded={open}
                aria-haspopup="menu"
                className={[
                    "w-full flex items-center gap-2.5 p-2 rounded-lg border transition-colors duration-150 text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border",
                    open
                        ? "bg-sidebar-bg-hover border-border-medium"
                        : "bg-sidebar-bg-hover/60 border-sidebar-border hover:bg-sidebar-bg-hover hover:border-border-medium",
                ].join(" ")}
            >
                <span className="shrink-0">
                    <Avatar avatarUrl={avatarUrl} initial={initial} size={32} />
                </span>

                <span className="flex-1 min-w-0 flex flex-col leading-tight">
                    <span className="font-sans text-[15px] font-bold text-sidebar-fg-hover truncate">
                        {displayName}
                    </span>
                    {email && email !== displayName && (
                        <span className="font-mono text-[11px] tracking-[0.02em] text-sidebar-label truncate mt-0.5">
                            {email}
                        </span>
                    )}
                </span>

                <UpChevron />
            </button>

            <PortalMenu
                open={open}
                onClose={() => setOpen(false)}
                anchorRef={ref}
                align="left"
                side="top"
                className="!p-0 w-[min(388px,calc(100vw-16px))] max-h-[calc(100dvh-24px)] overflow-y-auto !border-sidebar-border !bg-sidebar-bg"
            >
                <AccountMenu
                    className="w-full"
                    email={email}
                    displayName={displayName}
                    planName={planName}
                    allTenants={allTenants}
                    activeTenantId={activeTenantId}
                    onSwitchTenant={(id) => { switchTenant(id); setOpen(false); router.refresh(); }}
                    onProfileClick={() => { setOpen(false); router.push(profileHref); }}
                    onHelpClick={() => { setOpen(false); router.push(helpHref); }}
                    onStatusClick={() => { setOpen(false); router.push(statusHref); }}
                    onBillingClick={() => { setOpen(false); router.push(billingHref); }}
                    onSignOut={async () => { setOpen(false); await onSignOut(); }}
                />
            </PortalMenu>
        </div>
    );
}

function Avatar({ avatarUrl, initial, size }: { avatarUrl?: string | null; initial: string; size: number }) {
    return (
        <span
            aria-hidden="true"
            style={{ width: size, height: size }}
            className="relative rounded-full bg-primary-500/10 border border-primary-500/20 overflow-hidden flex items-center justify-center shrink-0 shadow-sm"
        >
            {avatarUrl ? (
                <Image src={avatarUrl} alt="" fill unoptimized sizes="32px" className="object-cover" />
            ) : (
                <span className="font-mono text-[11px] font-bold text-primary-500 uppercase">{initial}</span>
            )}
        </span>
    );
}

/**
 * Up-chevron — signals "this menu opens upward". Replaces the previous
 * double-chevron, which over-claimed the affordance: the menu only opens up,
 * it doesn't go both directions.
 */
function UpChevron() {
    return (
        <svg
            aria-hidden="true"
            className="shrink-0 text-sidebar-label"
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        >
            <path d="M3 7L6 4l3 3" />
        </svg>
    );
}

// ── Account menu (tenants + profile + sign out) ──────────────────────────

interface AccountMenuProps {
    className:      string;
    email?:         string | null;
    displayName:    string;
    planName?:      string | null;
    allTenants:     Array<{ tenantId: string; tenantEmail: string; tenantAvatarUrl: string | null; isOwn: boolean; role: string }>;
    activeTenantId: string | null;
    onSwitchTenant: (id: string) => void;
    onProfileClick: () => void;
    onHelpClick:    () => void;
    onStatusClick:  () => void;
    onBillingClick: () => void;
    onSignOut:      () => void;
}

function AccountMenu({ className, email, displayName, planName, allTenants, activeTenantId, onSwitchTenant, onProfileClick, onHelpClick, onStatusClick, onBillingClick, onSignOut }: AccountMenuProps) {
    const hasMultipleTenants = allTenants.length > 1;
    const { theme, setTheme } = useTheme();

    return (
        <div
            className={[
                "overflow-hidden bg-sidebar-bg",
                className,
            ].join(" ")}
        >
            <div className="px-3 py-3 border-b border-sidebar-border flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="font-sans text-[16px] font-bold text-sidebar-fg-hover truncate">{displayName}</p>
                    {email && (
                        <p className="font-mono text-[12px] text-sidebar-label truncate mt-0.5">{email}</p>
                    )}
                    {planName && (
                        <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-md font-sans text-[11px] font-semibold bg-sidebar-bg-hover text-sidebar-label border border-sidebar-border">
                            {sentenceCase(planName)}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    role="menuitem"
                    onClick={onProfileClick}
                    aria-label="Abrir perfil"
                    className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg text-sidebar-label hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
                >
                    <Settings size={16} strokeWidth={1.8} />
                </button>
            </div>

            {/* Tenant switcher (only when multiple tenants) */}
            {hasMultipleTenants && (
                <div className="p-1.5 border-b border-sidebar-border">
                    <p className="px-2 pt-1 pb-1.5 font-sans text-[12px] font-semibold text-sidebar-label">
                        Cambiar cuenta
                    </p>
                    <ul>
                        {allTenants.map((t) => {
                            const isSelected = t.tenantId === activeTenantId;
                            return (
                                <li key={t.tenantId}>
                                    <button
                                        role="menuitemradio"
                                        aria-checked={isSelected}
                                        onClick={() => onSwitchTenant(t.tenantId)}
                                        className={[
                                            "w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors duration-100 font-sans text-[14px] font-semibold",
                                            isSelected ? "text-sidebar-fg-hover bg-sidebar-bg-hover" : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                        ].join(" ")}
                                    >
                                        <span className="w-5 h-5 rounded-md bg-primary-500/10 border border-primary-500/20 flex items-center justify-center overflow-hidden shrink-0">
                                            {t.tenantAvatarUrl ? (
                                                <Image src={t.tenantAvatarUrl} alt="" width={20} height={20} unoptimized className="object-cover" />
                                            ) : (
                                                <span className="font-mono text-[10px] font-bold text-primary-500 uppercase">
                                                    {t.tenantEmail[0] ?? "?"}
                                                </span>
                                            )}
                                        </span>
                                        <span className="truncate flex-1">{t.isOwn ? "Mi cuenta" : t.tenantEmail}</span>
                                        {!t.isOwn && (
                                            <span className="px-2 py-0.5 rounded-md bg-sidebar-bg-hover text-sidebar-label text-[11px] font-semibold shrink-0">
                                                {sentenceCase(t.role)}
                                            </span>
                                        )}
                                        {isSelected && <Check size={15} className="ml-auto shrink-0" strokeWidth={2} />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            <div className="p-1.5 border-b border-sidebar-border">
                <div className="h-10 px-2 flex items-center justify-between gap-3 font-sans text-[14px] font-semibold text-sidebar-fg">
                    <span>Tema</span>
                    <span className="inline-flex items-center rounded-lg border border-sidebar-border bg-sidebar-bg-hover/60 p-0.5">
                        <button
                            type="button"
                            onClick={() => setTheme("light")}
                            aria-label="Usar tema claro"
                            aria-pressed={theme === "light"}
                            className={[
                                "w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors",
                                theme === "light" ? "bg-sidebar-bg text-sidebar-fg-hover shadow-sm" : "text-sidebar-label hover:text-sidebar-fg-hover",
                            ].join(" ")}
                        >
                            <Sun size={15} strokeWidth={1.8} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setTheme("dark")}
                            aria-label="Usar tema oscuro"
                            aria-pressed={theme === "dark"}
                            className={[
                                "w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors",
                                theme === "dark" ? "bg-sidebar-bg text-sidebar-fg-hover shadow-sm" : "text-sidebar-label hover:text-sidebar-fg-hover",
                            ].join(" ")}
                        >
                            <Moon size={15} strokeWidth={1.8} />
                        </button>
                    </span>
                </div>
                <button
                    role="menuitem"
                    onClick={onProfileClick}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors duration-100 font-sans text-[14px] font-semibold text-sidebar-fg hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover"
                >
                    <UserRound size={16} className="text-sidebar-label" strokeWidth={1.8} />
                    Mi perfil
                </button>
                <button
                    role="menuitem"
                    onClick={onHelpClick}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors duration-100 font-sans text-[14px] font-semibold text-sidebar-fg hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover"
                >
                    <LifeBuoy size={16} className="text-sidebar-label" strokeWidth={1.8} />
                    Ayuda
                </button>
                <button
                    role="menuitem"
                    onClick={onSignOut}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors duration-100 font-sans text-[14px] font-semibold text-sidebar-fg hover:text-red-500 hover:bg-red-500/5"
                >
                    <LogOut size={16} strokeWidth={1.8} />
                    Cerrar sesión
                </button>
            </div>

            <div className="p-2 border-b border-sidebar-border">
                <button
                    type="button"
                    onClick={onBillingClick}
                    className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-lg bg-sidebar-fg-hover text-sidebar-bg font-sans text-[14px] font-bold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
                >
                    <CreditCard size={15} strokeWidth={1.8} />
                    Facturación y plan
                </button>
            </div>

            <button
                type="button"
                onClick={onStatusClick}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left font-sans text-[13px] font-semibold text-sidebar-fg hover:text-sidebar-fg-hover hover:bg-sidebar-bg-hover transition-colors"
            >
                <Activity size={15} className="text-sidebar-label" strokeWidth={1.8} />
                <span className="flex-1">Estado de portales</span>
                <span aria-hidden="true" className="w-2 h-2 rounded-full bg-sky-500" />
            </button>
        </div>
    );
}
