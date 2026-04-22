import { Info } from "lucide-react";

export function StatusBanner() {
    return (
        <div className="rounded-xl border border-border-light bg-surface-1 px-4 py-3 flex items-start gap-3 text-[12px] text-foreground/70 leading-relaxed">
            <Info size={16} className="shrink-0 mt-0.5 text-foreground/50" />
            <p>
                Las verificaciones combinan chequeos desde nuestro servidor más aportes anónimos de visitantes desde Venezuela.
                Si ves un portal como caído desde tu conexión, al cargar esta página tu navegador ayuda a confirmarlo
                automáticamente.
            </p>
        </div>
    );
}
