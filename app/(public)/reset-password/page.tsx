"use client";

// ============================================================================
// RESET PASSWORD — redirect shim
//
// El flujo de recuperación se unificó en /forgot-password (3 etapas con OTP
// numérico: correo → código → contraseña). Esta página queda únicamente
// para que los usuarios con correos viejos (los que aún traen magic-link
// apuntando a /reset-password) no caigan en un 404 — los enviamos al inicio
// del flujo nuevo con un mensaje breve.
// ============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { AuthShell, AuthHeader, AuthVisual } from "../_components/auth-shell";

export default function ResetPasswordPage() {
    const router = useRouter();

    useEffect(() => {
        // Pequeño delay para que el usuario alcance a leer el cartel.
        const t = setTimeout(() => router.replace("/forgot-password"), 2500);
        return () => clearTimeout(t);
    }, [router]);

    const visual = (
        <AuthVisual
            heading={<>Cambió el flujo,<br /><span className="text-white/70">ahora más simple.</span></>}
            copy="Sustituimos los enlaces por un código numérico de un solo uso. Te llevamos al inicio del flujo nuevo."
        />
    );

    return (
        <AuthShell visual={visual}>
            <AuthHeader
                icon={<KeyRound className="w-5 h-5 text-white" />}
                title="Solicita un nuevo código"
                subtitle="Actualizamos la recuperación: ahora es un código numérico en vez de un enlace."
            />

            <div className="space-y-5">
                <div className="p-5 border border-border-light rounded-2xl bg-surface-1 shadow-sm">
                    <p className="font-sans text-[13px] text-text-tertiary leading-relaxed">
                        Si llegaste aquí desde un correo viejo, vuelve a iniciar el flujo: te
                        enviaremos un código nuevo a tu bandeja de entrada.
                    </p>
                </div>

                <BaseButton.Root
                    as={Link}
                    href="/forgot-password"
                    variant="primary"
                    className="w-full h-11 rounded-xl shadow-sm"
                >
                    Solicitar código
                    <ArrowRight className="w-4 h-4" />
                </BaseButton.Root>

                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-disabled text-center">
                    Te redirigimos automáticamente…
                </p>
            </div>
        </AuthShell>
    );
}
