import type { Metadata } from "next";

export const metadata: Metadata = {
    title:       "Nómina · Acceso",
    description: "Sistema de gestión de nómina — Venezuela",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative min-h-dvh bg-background text-foreground overflow-hidden">

            {/* ── Ledger grid ───────────────────────────────────────────── */}
            <div
                aria-hidden
                className="pointer-events-none fixed inset-0 z-0"
                style={{
                    backgroundImage: `
                        linear-gradient(var(--grid-line) 1px, transparent 1px),
                        linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)
                    `,
                    backgroundSize: "48px 48px",
                }}
            />

            {/* ── Primary glow — top-left ───────────────────────────────── */}
            <div
                aria-hidden
                className="pointer-events-none fixed z-0"
                style={{
                    top: "-20%", left: "-10%",
                    width: "60vw", height: "60vw",
                    background: "radial-gradient(circle, rgba(8,145,178,0.10) 0%, transparent 70%)",
                }}
            />

            {/* ── Primary glow — bottom-right ───────────────────────────── */}
            <div
                aria-hidden
                className="pointer-events-none fixed z-0"
                style={{
                    bottom: "-20%", right: "-10%",
                    width: "50vw", height: "50vw",
                    background: "radial-gradient(circle, rgba(8,145,178,0.06) 0%, transparent 70%)",
                }}
            />

            {/* ── Top bar ───────────────────────────────────────────────── */}
            <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-foreground/[0.07]">
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-[5px] bg-primary-500 flex items-center justify-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <rect x="1" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.9" />
                            <rect x="8" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                            <rect x="1" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                            <rect x="8" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.9" />
                        </svg>
                    </div>
                    <span className="font-mono text-[13px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
                        Kont
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                        Sistema operativo
                    </span>
                </div>
            </header>

            {/* ── Page content ──────────────────────────────────────────── */}
            <main className="relative z-10">
                {children}
            </main>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <footer className="relative z-10 flex items-center justify-between px-8 py-4 border-t border-foreground/[0.07] mt-auto">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                    © {new Date().getFullYear()} Kont
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                    v2.2 · LOTTT
                </span>
            </footer>
        </div>
    );
}
