"use client";

import { useTheme } from "@/src/shared/frontend/components/theme-provider";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

export default function AparienciaPage() {
    const { theme, setTheme } = useTheme();

    return (
        <div className="max-w-lg font-mono">

            <div className="space-y-6">
                <div>
                    <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40 mb-3">
                        Tema de la aplicación
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setTheme("light")}
                            className={[
                                "flex flex-col items-center gap-3 p-4 rounded-xl border transition-all duration-200 group",
                                theme === "light" 
                                    ? "bg-primary-500/5 border-primary-500/40 ring-1 ring-primary-500/20" 
                                    : "bg-surface-2 border-border-light hover:border-border-medium"
                            ].join(" ")}
                        >
                            <div className="w-full aspect-video rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
                                <div className="w-1/2 h-1/2 rounded bg-gray-100 border border-gray-200" />
                            </div>
                            <span className={theme === "light" ? "text-primary-500 font-bold" : "text-foreground/60"}>
                                Modo Claro
                            </span>
                        </button>

                        <button
                            onClick={() => setTheme("dark")}
                            className={[
                                "flex flex-col items-center gap-3 p-4 rounded-xl border transition-all duration-200 group",
                                theme === "dark" 
                                    ? "bg-primary-500/5 border-primary-500/40 ring-1 ring-primary-500/20" 
                                    : "bg-surface-2 border-border-light hover:border-border-medium"
                            ].join(" ")}
                        >
                            <div className="w-full aspect-video rounded-lg bg-gray-950 border border-gray-800 flex items-center justify-center overflow-hidden">
                                <div className="w-1/2 h-1/2 rounded bg-gray-900 border border-gray-800" />
                            </div>
                            <span className={theme === "dark" ? "text-primary-500 font-bold" : "text-foreground/60"}>
                                Modo Oscuro
                            </span>
                        </button>
                    </div>
                </div>

                <div className="pt-6 border-t border-border-light">
                    <p className="text-[10px] text-foreground/30 leading-relaxed uppercase tracking-wider">
                        Configura cómo prefieres ver Konta. Estos ajustes se guardan localmente en tu navegador.
                    </p>
                </div>
            </div>
        </div>
    );
}
