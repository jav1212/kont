"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { APP_MODULES } from "@/src/shared/frontend/navigation";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";

const MODULE_ICONS: Record<string, React.ReactNode> = {
    payroll: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="11" height="11" rx="1.5" />
            <path d="M4 5h5M4 7.5h3" />
        </svg>
    ),
    inventory: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4l5.5-3 5.5 3v5l-5.5 3L1 9V4z" />
            <path d="M6.5 1v11M1 4l5.5 3 5.5-3" />
        </svg>
    ),
};

export function AppSidebar() {
    const pathname = usePathname();
    const router   = useRouter();
    const { signOut } = useAuth();

    async function handleSignOut() {
        await signOut();
        router.replace("/sign-in");
    }

    return (
        <aside className="w-52 h-full flex-shrink-0 bg-[#0a0a0b] border-r border-white/[0.06] flex flex-col">

            {/* ── Logo ──────────────────────────────────────────────────── */}
            <div className="px-5 py-5 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-[5px] bg-indigo-500 flex items-center justify-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <rect x="1" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.9" />
                            <rect x="8" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                            <rect x="1" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                            <rect x="8" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.9" />
                        </svg>
                    </div>
                    <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/60">
                        Kont
                    </span>
                </div>
            </div>

            {/* ── Module nav ────────────────────────────────────────────── */}
            <nav className="flex-1 px-3 py-4 space-y-1">
                <p className="px-2 mb-3 font-mono text-[9px] uppercase tracking-[0.24em] text-white/20">
                    Módulos
                </p>
                {APP_MODULES.map((mod) => {
                    const isActive = pathname.startsWith(mod.href);
                    return (
                        <Link
                            key={mod.id}
                            href={mod.href}
                            className={[
                                "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150",
                                "font-mono text-[11px] uppercase tracking-[0.14em]",
                                isActive
                                    ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                    : "text-white/40 hover:text-white/70 hover:bg-white/[0.04] border border-transparent",
                            ].join(" ")}
                        >
                            {MODULE_ICONS[mod.id]}
                            {mod.label}
                        </Link>
                    );
                })}
            </nav>

            {/* ── Sign out ──────────────────────────────────────────────── */}
            <div className="px-3 py-4 border-t border-white/[0.06]">
                <button
                    onClick={handleSignOut}
                    className={[
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150",
                        "font-mono text-[11px] uppercase tracking-[0.14em]",
                        "text-white/30 hover:text-red-400/70 hover:bg-red-500/[0.04] border border-transparent",
                    ].join(" ")}
                >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M9 9l3-3-3-3M12 6.5H5" />
                    </svg>
                    Salir
                </button>
            </div>

        </aside>
    );
}
