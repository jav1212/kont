"use client";

export function Disclaimer() {
    return (
        <div className="mt-10 pt-6 border-t border-border-light">
            <p className="text-[11px] font-mono text-text-disabled leading-relaxed max-w-[680px]">
                <strong className="text-text-tertiary">Nota legal:</strong> Datos tomados de la{" "}
                <strong>Providencia Administrativa SNAT/2025/000091</strong>, publicada en la Gaceta
                Oficial de la República Bolivariana de Venezuela Nº 43.273 del 09 de diciembre de
                2025, y complementada por las Providencias SNAT/2025/000092 y SNAT/2025/000093.
                Esta herramienta es informativa; ante cualquier duda o modificación posterior, verifique
                las fechas oficiales en el portal{" "}
                <a
                    href="https://www.seniat.gob.ve"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-link hover:text-text-link-hover underline underline-offset-2 transition-colors"
                >
                    www.seniat.gob.ve
                </a>
                . Kontave no asume responsabilidad por incumplimientos derivados del uso de esta
                herramienta. Consulte a su asesor fiscal antes de tomar decisiones basadas en esta
                información.
            </p>
        </div>
    );
}
