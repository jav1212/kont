"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[global-error]", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-8">
            <div className="max-w-md w-full space-y-6">
                <div className="flex items-center gap-3">
                    <div className="h-px w-6 bg-red-500/60" />
                    <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-error">
                        Error del sistema
                    </span>
                </div>
                <h1 className="font-mono text-[28px] font-black uppercase tracking-tighter text-foreground leading-none">
                    Algo salió<br />mal.
                </h1>
                <p className="font-mono text-[11px] text-text-tertiary leading-relaxed">
                    Ocurrió un error inesperado. Puedes intentar recargar la página.
                    Si el problema persiste, contacta al soporte.
                </p>
                {error.digest && (
                    <p className="font-mono text-[9px] text-text-disabled tracking-widest">
                        REF: {error.digest}
                    </p>
                )}
                <div className="flex items-center gap-3">
                    <button
                        onClick={reset}
                        className={[
                            "h-9 px-5 rounded-lg",
                            "bg-primary-500 hover:bg-primary-400",
                            "font-mono text-[10px] uppercase tracking-[0.18em] text-white",
                            "transition-colors duration-150",
                        ].join(" ")}
                    >
                        Reintentar
                    </button>
                    <Link
                        href="/"
                        className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                        Ir al inicio
                    </Link>
                </div>
            </div>
        </div>
    );
}
