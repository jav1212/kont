import type { Metadata } from "next";
import { LogoFull } from "@/src/shared/frontend/components/logo";

export const metadata: Metadata = {
    title:       "Konta · Acceso",
    description: "Sistema de gestión contable — Venezuela",
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
                    background: "radial-gradient(circle, rgba(255,74,24,0.08) 0%, transparent 70%)",
                }}
            />

            {/* ── Primary glow — bottom-right ───────────────────────────── */}
            <div
                aria-hidden
                className="pointer-events-none fixed z-0"
                style={{
                    bottom: "-20%", right: "-10%",
                    width: "50vw", height: "50vw",
                    background: "radial-gradient(circle, rgba(255,74,24,0.05) 0%, transparent 70%)",
                }}
            />

            {/* ── Top bar ───────────────────────────────────────────────── */}
            <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-foreground/[0.07]">
                <LogoFull size={40} className="text-foreground" />

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
                    © {new Date().getFullYear()} Konta
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-disabled)]">
                    v2.2 · LOTTT
                </span>
            </footer>
        </div>
    );
}
