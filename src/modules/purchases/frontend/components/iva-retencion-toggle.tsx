"use client";

// IvaRetencionToggle — selector compacto para la retención de IVA a nivel
// de cabecera de factura. Defaults soportados: 0 / 75 / 100 (los dos casos
// estándar del régimen de contribuyente especial en Venezuela).
//
// La retención NO es un descuento pre-IVA: se aplica DESPUÉS del IVA y reduce
// el monto a pagar al proveedor sin tocar la base imponible ni el crédito
// fiscal. Stored como % a nivel cabecera; el monto en Bs se calcula
// server-side al guardar (ver mig 080).

interface Props {
    value:    number;                  // 0 | 75 | 100
    onChange: (pct: number) => void;
    readOnly?: boolean;
}

const OPTIONS: { label: string; value: number }[] = [
    { label: "Sin retención", value: 0   },
    { label: "75 %",          value: 75  },
    { label: "100 %",         value: 100 },
];

export function IvaRetencionToggle({ value, onChange, readOnly }: Props) {
    return (
        <div className="flex items-center gap-2">
            <span className="min-w-[100px] font-mono text-[10px] uppercase tracking-[0.14em] text-info">
                Retención IVA
            </span>
            <div className="inline-flex rounded-md border border-border-light bg-surface-1 p-0.5">
                {OPTIONS.map((opt) => {
                    const active = value === opt.value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => !readOnly && onChange(opt.value)}
                            disabled={readOnly}
                            className={[
                                "h-7 px-2.5 rounded text-[11px] font-mono uppercase tracking-[0.10em] transition-colors",
                                active
                                    ? "bg-info/15 text-info border border-info/30 font-bold"
                                    : "text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 border border-transparent",
                                readOnly ? "cursor-not-allowed opacity-60" : "",
                            ].join(" ")}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
