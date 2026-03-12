import type { Metadata } from "next";

export const metadata: Metadata = {
    title:       "Nómina · Acceso",
    description: "Sistema de gestión de nómina — Venezuela",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative min-h-screen bg-[#0a0a0b] text-white overflow-hidden">

            {/* ── Ledger grid ───────────────────────────────────────────── */}
            <div
                aria-hidden
                className="pointer-events-none fixed inset-0 z-0"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
                    `,
                    backgroundSize: "48px 48px",
                }}
            />

            {/* ── Indigo glow — top-left ────────────────────────────────── */}
            <div
                aria-hidden
                className="pointer-events-none fixed z-0"
                style={{
                    top: "-20%", left: "-10%",
                    width: "60vw", height: "60vw",
                    background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
                }}
            />

            {/* ── Indigo glow — bottom-right ────────────────────────────── */}
            <div
                aria-hidden
                className="pointer-events-none fixed z-0"
                style={{
                    bottom: "-20%", right: "-10%",
                    width: "50vw", height: "50vw",
                    background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
                }}
            />

            {/* ── Top bar ───────────────────────────────────────────────── */}
            <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/[0.06]">
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

                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">
                        Sistema operativo
                    </span>
                </div>
            </header>

            {/* ── Page content ──────────────────────────────────────────── */}
            <main className="relative z-10">
                {children}
            </main>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <footer className="relative z-10 flex items-center justify-between px-8 py-4 border-t border-white/[0.06] mt-auto">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">
                    © {new Date().getFullYear()} Kont
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">
                    v2.2 · LOTTT
                </span>
            </footer>
        </div>
    );
}
