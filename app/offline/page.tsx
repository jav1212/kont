"use client";

export default function OfflinePage() {
    return (
        <div className="min-h-dvh bg-surface-2 flex flex-col items-center justify-center px-8 py-16 text-center gap-6 font-mono">

            {/* Icon */}
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-foreground/[0.04] border border-border-light">
                <svg
                    width="32" height="32" viewBox="0 0 32 32"
                    fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-foreground/30"
                >
                    <path d="M4 4l24 24" />
                    <path d="M8.5 8.6A13 13 0 0 0 4 16c3 4.4 7.6 7 12 7a12.8 12.8 0 0 0 7.4-2.4M12 5.3A12.8 12.8 0 0 1 16 5c4.4 0 9 2.6 12 7a13.3 13.3 0 0 1-2.9 3.6" />
                    <circle cx="16" cy="16" r="3" />
                </svg>
            </div>

            {/* Text */}
            <div className="space-y-2 max-w-xs">
                <p className="text-[15px] font-semibold text-foreground">
                    Sin conexión
                </p>
                <p className="text-[13px] text-foreground/50 leading-relaxed">
                    No hay conexión a internet. Verifica tu red e intenta de nuevo.
                </p>
            </div>

            {/* Retry */}
            <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] text-foreground/60 border border-border-light hover:bg-foreground/[0.04] hover:text-foreground transition-colors duration-150"
            >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1.5 6.5A5 5 0 0 1 11 3.5M11.5 6.5A5 5 0 0 1 2 9.5" />
                    <path d="M9.5 1.5l1.5 2-2 1.5M3.5 11.5l-1.5-2 2-1.5" />
                </svg>
                Reintentar
            </button>

            {/* Logo */}
            <div className="absolute bottom-8 flex items-center gap-2.5 opacity-40">
                <div className="w-5 h-5 rounded-[4px] bg-primary-500 flex items-center justify-center" aria-hidden="true">
                    <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                        <rect x="1" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.95" />
                        <rect x="8" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                        <rect x="1" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.4" />
                        <rect x="8" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.95" />
                    </svg>
                </div>
                <span className="text-[11px] uppercase tracking-widest text-foreground">Kont</span>
            </div>

        </div>
    );
}
