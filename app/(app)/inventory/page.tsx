"use client";

// ============================================================================
// Inventario — placeholder (módulo en desarrollo)
// ============================================================================

export default function InventoryPage() {
    return (
        <div className="min-h-full bg-surface-2 p-8 font-mono flex items-center justify-center">
            <div className="max-w-sm text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-xl border border-border-light bg-surface-1 flex items-center justify-center text-foreground/20">
                    <svg width="22" height="22" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 4l5.5-3 5.5 3v5l-5.5 3L1 9V4z" />
                        <path d="M6.5 1v11M1 4l5.5 3 5.5-3" />
                    </svg>
                </div>
                <div>
                    <h1 className="font-mono text-[14px] font-bold uppercase tracking-[0.18em] text-foreground">
                        Inventario
                    </h1>
                    <p className="font-mono text-[10px] text-foreground/35 uppercase tracking-[0.16em] mt-1.5">
                        Módulo en desarrollo
                    </p>
                </div>
                <p className="font-mono text-[11px] text-foreground/40 leading-relaxed">
                    El módulo de control de inventario estará disponible próximamente.
                </p>
            </div>
        </div>
    );
}
