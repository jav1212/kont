import Link from "next/link";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-8">
            <div className="max-w-md w-full space-y-6">
                <div className="flex items-center gap-3">
                    <div className="h-px w-6 bg-primary-500/60" />
                    <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-link">
                        404
                    </span>
                </div>
                <h1 className="font-mono text-[28px] font-black uppercase tracking-tighter text-foreground leading-none">
                    Página no<br />encontrada.
                </h1>
                <p className="font-mono text-[11px] text-text-tertiary leading-relaxed">
                    La ruta que buscas no existe o fue movida.
                </p>
                <Link
                    href="/"
                    className={[
                        "inline-flex items-center gap-2 h-9 px-5 rounded-lg",
                        "bg-primary-500 hover:bg-primary-400",
                        "font-mono text-[10px] uppercase tracking-[0.18em] text-white",
                        "transition-colors duration-150",
                    ].join(" ")}
                >
                    Ir al inicio
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 5h6M5 2l3 3-3 3" />
                    </svg>
                </Link>
            </div>
        </div>
    );
}
