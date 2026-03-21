"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveTenantContext } from "../context/active-tenant-context";
import { APP_SIZES } from "@/src/shared/frontend/sizes";

const ChevronIcon = ({ open }: { open: boolean }) => (
    <svg
        width="10" height="10" viewBox="0 0 10 10" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true"
        className={`flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : "rotate-0"}`}
    >
        <path d="M2 4l3 3 3-3" />
    </svg>
);

function TenantAvatar({ email }: { email?: string }) {
    return (
        <div
            aria-hidden="true"
            className="w-5 h-5 rounded-md bg-primary-500/10 flex items-center justify-center flex-shrink-0"
        >
            <span className={`font-mono ${APP_SIZES.nav.companyAvatar} font-bold text-primary-400 uppercase`}>
                {email?.[0] ?? "?"}
            </span>
        </div>
    );
}

export function TenantSwitcher() {
    const router  = useRouter();
    const { allTenants, activeTenantId, isActingOnBehalf, activeTenantRole, switchTenant } =
        useActiveTenantContext();

    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handle(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        function handle(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
        document.addEventListener("keydown", handle);
        return () => document.removeEventListener("keydown", handle);
    }, [open]);

    // Only render when the user has access to multiple tenants
    if (allTenants.length <= 1) return null;

    const activeTenant = allTenants.find((t) => t.tenantId === activeTenantId);

    function handleSelect(tenantId: string) {
        switchTenant(tenantId);
        setOpen(false);
        router.refresh();
    }

    return (
        <div className="px-3 py-3 border-b border-sidebar-border">
            <p className={`px-2 mb-1.5 font-mono ${APP_SIZES.nav.sectionLabel} uppercase text-sidebar-label`}>
                Tenant
            </p>

            <div className="relative" ref={ref}>
                <button
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-haspopup="listbox"
                    aria-label={`Tenant activo: ${activeTenant?.tenantEmail ?? "Propio"}. Cambiar tenant`}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors duration-150 text-sidebar-fg hover:bg-sidebar-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border"
                >
                    <TenantAvatar email={activeTenant?.tenantEmail} />
                    <span className={`font-mono ${APP_SIZES.nav.companyName} truncate flex-1 text-left`}>
                        {activeTenant?.isOwn ? "Mi cuenta" : (activeTenant?.tenantEmail ?? "Seleccionar…")}
                    </span>
                    {isActingOnBehalf && activeTenantRole && (
                        <span className={`font-mono ${APP_SIZES.nav.sectionLabel} px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400 uppercase flex-shrink-0`}>
                            {activeTenantRole}
                        </span>
                    )}
                    <ChevronIcon open={open} />
                </button>

                {open && (
                    <ul
                        role="listbox"
                        aria-label="Tenants disponibles"
                        className="absolute left-0 right-0 top-full mt-1 rounded-lg overflow-hidden z-50 shadow-lg bg-sidebar-bg border border-sidebar-border"
                        style={{ boxShadow: "var(--shadow-lg)" }}
                    >
                        {allTenants.map((t) => {
                            const isSelected = t.tenantId === activeTenantId;
                            return (
                                <li key={t.tenantId} role="option" aria-selected={isSelected}>
                                    <button
                                        onClick={() => handleSelect(t.tenantId)}
                                        className={[
                                            `w-full flex items-center gap-2 px-3 py-2 transition-colors duration-100 font-mono ${APP_SIZES.nav.companyName} text-left`,
                                            isSelected
                                                ? "text-sidebar-active-fg bg-sidebar-active-bg"
                                                : "text-sidebar-fg hover:bg-sidebar-bg-hover",
                                        ].join(" ")}
                                    >
                                        <TenantAvatar email={t.tenantEmail} />
                                        <span className="truncate flex-1">
                                            {t.isOwn ? "Mi cuenta" : t.tenantEmail}
                                        </span>
                                        {!t.isOwn && (
                                            <span className={`font-mono ${APP_SIZES.nav.sectionLabel} px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400 uppercase flex-shrink-0`}>
                                                {t.role}
                                            </span>
                                        )}
                                        {isSelected && (
                                            <svg className="ml-auto flex-shrink-0" width="10" height="10" viewBox="0 0 10 10"
                                                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M2 5.5l2.5 2.5 4-5" />
                                            </svg>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
