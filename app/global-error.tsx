"use client";

// Last-resort boundary for failures in the root layout itself (providers,
// fonts, Toaster). It replaces the whole document, so it renders its own
// <html>/<body> and only uses inline styles: the root layout's CSS and theme
// may be the thing that failed.

import "./globals.css";
import { IncidentReference } from "@/src/shared/frontend/feedback/incident-reference";
import { useBoundaryIncident } from "@/src/shared/frontend/feedback/use-boundary-incident";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const incident = useBoundaryIncident(error, "web.boundary.global");

    return (
        <html lang="es">
            <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "ui-monospace, monospace", background: "#0f1115", color: "#e6e8ec" }}>
                <main style={{ maxWidth: 420, width: "100%", display: "grid", gap: 20 }}>
                    <span style={{ fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: "#f87171" }}>Error del sistema</span>
                    <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, textTransform: "uppercase", lineHeight: 1 }}>Kontave no pudo cargar.</h1>
                    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#a3a8b3" }}>
                        Ocurrió un error inesperado al iniciar la aplicación. Intenta de nuevo; si persiste, contacta al soporte con el código.
                    </p>
                    <IncidentReference incident={incident} />
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <button
                            type="button"
                            onClick={reset}
                            style={{ height: 36, padding: "0 20px", borderRadius: 8, border: 0, background: "#ff6a3d", color: "#fff", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer" }}
                        >
                            Reintentar
                        </button>
                        {/* A full document load on purpose: the client router may be what failed. */}
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                        <a href="/" style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a3a8b3" }}>Ir al inicio</a>
                    </div>
                </main>
            </body>
        </html>
    );
}
