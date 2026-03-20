"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[app-error]", error);
    }, [error]);

    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-sm w-full space-y-5">
                <div className="flex items-center gap-3">
                    <div className="h-px w-5 bg-red-500/60" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-red-400/70">
                        Error
                    </span>
                </div>
                <h2 className="font-mono text-[22px] font-black uppercase tracking-tighter text-foreground leading-none">
                    Algo salió mal.
                </h2>
                <p className="font-mono text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                    No se pudo cargar esta sección. Puedes reintentar o navegar a otra parte del sistema.
                </p>
                {error.digest && (
                    <p className="font-mono text-[9px] text-[var(--text-disabled)] tracking-widest">
                        REF: {error.digest}
                    </p>
                )}
                <div className="flex items-center gap-3">
                    <button
                        onClick={reset}
                        className={[
                            "h-8 px-4 rounded-lg",
                            "bg-primary-500 hover:bg-primary-400",
                            "font-mono text-[10px] uppercase tracking-[0.18em] text-white",
                            "transition-colors duration-150",
                        ].join(" ")}
                    >
                        Reintentar
                    </button>
                    <Link
                        href="/payroll"
                        className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                    >
                        Ir a nómina
                    </Link>
                </div>
            </div>
        </div>
    );
}
