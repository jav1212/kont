"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router   = useRouter();
    const pathname = usePathname();

    const isSignIn = pathname === "/admin/sign-in";

    async function handleSignOut() {
        await fetch("/api/admin/sign-out", { method: "POST" });
        router.replace("/admin/sign-in");
    }

    if (isSignIn) return <>{children}</>;

    return (
        <div className="min-h-screen flex flex-col bg-surface-2">

            {/* Top bar */}
            <header className="h-12 flex items-center justify-between px-6 border-b border-border-light bg-surface-1 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-[4px] bg-red-600 flex items-center justify-center">
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                            <rect x="1" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.9" />
                            <rect x="8" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                            <rect x="1" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                            <rect x="8" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.9" />
                        </svg>
                    </div>
                    <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground">
                        Kont
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-red-500/60 border border-red-500/20 px-1.5 py-0.5 rounded">
                        Admin
                    </span>
                </div>

                <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/[0.06] transition-colors border border-transparent hover:border-red-500/10"
                >
                    <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M9 9l3-3-3-3M12 6.5H5" />
                    </svg>
                    Salir
                </button>
            </header>

            <main className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
