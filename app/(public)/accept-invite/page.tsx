"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Loader2,
    Users,
    ShieldAlert,
    Link2Off,
    UserPlus,
    LogIn,
} from "lucide-react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { LogoMark } from "@/src/shared/frontend/components/logo";
import { AuthShell, AuthHeader, AuthVisual } from "../_components/auth-shell";

const ERROR_MESSAGES: Record<string, string> = {
    invalid:        "La invitación es inválida o ya fue usada.",
    expired:        "La invitación ha expirado.",
    email_mismatch: "El email de la invitación no coincide con tu cuenta.",
    server:         "Ocurrió un error en el servidor. Intenta de nuevo.",
};

function InviteVisual() {
    return (
        <AuthVisual
            heading={<>Trabajo en equipo<br /><span className="text-white/70">sobre el mismo libro contable.</span></>}
            copy="Únete a tu organización en Kontave y colabora en tiempo real con tus colegas de forma segura."
        />
    );
}

function AcceptInviteInner() {
    const searchParams = useSearchParams();
    const router       = useRouter();
    const { isLoading: authLoading, isAuthenticated } = useAuth();

    const token        = searchParams.get("token");
    const errorParam   = searchParams.get("error");
    const switchTenant = searchParams.get("switchTenant");

    const [status]   = useState<"idle" | "accepting" | "error">(errorParam ? "error" : "idle");
    const errorMsg   = errorParam ? (ERROR_MESSAGES[errorParam] ?? "Invitación inválida.") : null;

    useEffect(() => {
        if (switchTenant && isAuthenticated) {
            if (typeof window !== "undefined") {
                localStorage.setItem("kont-active-tenant-id", switchTenant);
            }
            router.replace("/");
        }
    }, [switchTenant, isAuthenticated, router]);

    const acceptingRef = useRef(false);
    useEffect(() => {
        if (authLoading || !token || !isAuthenticated || status !== "idle" || acceptingRef.current) return;
        acceptingRef.current = true;
        router.replace(`/api/memberships/accept?token=${token}`);
    }, [authLoading, token, isAuthenticated, status, router]);

    if (status === "error" || errorMsg) {
        return (
            <AuthShell visual={<InviteVisual />}>
                <AuthHeader
                    iconTone="danger"
                    icon={<ShieldAlert className="w-6 h-6 text-red-600 dark:text-red-400" />}
                    title="Invitación inválida"
                    subtitle={errorMsg ?? "Esta invitación de equipo no es válida o ha caducado."}
                />
                <BaseButton.Root as={Link} href="/" variant="primary" className="w-full h-11 rounded-xl shadow-sm">
                    Volver al inicio
                </BaseButton.Root>
            </AuthShell>
        );
    }

    if (!token && !switchTenant) {
        return (
            <AuthShell visual={<InviteVisual />}>
                <AuthHeader
                    iconTone="neutral"
                    icon={<Link2Off className="w-6 h-6 text-text-tertiary" />}
                    title="Enlace roto"
                    subtitle="No se detectó un token de invitación válido en esta URL."
                />
                <BaseButton.Root as={Link} href="/" variant="secondary" className="w-full h-11 rounded-xl">
                    Volver al inicio
                </BaseButton.Root>
            </AuthShell>
        );
    }

    if (!authLoading && !isAuthenticated && token) {
        return (
            <AuthShell visual={<InviteVisual />}>
                <AuthHeader
                    icon={<Users className="w-5 h-5 text-white" />}
                    title="Únete a Kontave"
                    subtitle="Se ha solicitado tu colaboración. Crea tu cuenta o inicia sesión para aceptar la invitación."
                />
                <div className="w-full space-y-3">
                    <BaseButton.Root
                        as={Link}
                        href={`/sign-up?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`}
                        variant="primary"
                        className="w-full h-11 rounded-xl shadow-sm"
                        leftIcon={<UserPlus className="w-4 h-4" />}
                    >
                        Crear cuenta gratis
                    </BaseButton.Root>
                    <BaseButton.Root
                        as={Link}
                        href={`/sign-in?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`}
                        variant="secondary"
                        className="w-full h-11 rounded-xl"
                        leftIcon={<LogIn className="w-4 h-4" />}
                    >
                        Ya tengo cuenta
                    </BaseButton.Root>
                </div>
            </AuthShell>
        );
    }

    // Default: accepting state — full-bleed loader, no split view needed
    return (
        <div className="flex-1 flex flex-col items-center justify-center bg-surface-1">
            <div className="flex flex-col items-center gap-6">
                <div className="relative">
                    <div className="w-20 h-20 rounded-full border-2 border-primary-500/20 flex items-center justify-center">
                        <Loader2 className="w-9 h-9 text-primary-500 animate-spin" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <LogoMark size={22} className="text-primary-500/30" />
                    </div>
                </div>
                <div className="text-center">
                    <h3 className="font-sans text-[17px] font-bold text-foreground mb-1">Aceptando invitación</h3>
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-text-tertiary animate-pulse">Sincronizando con el servidor…</p>
                </div>
            </div>
        </div>
    );
}

export default function AcceptInvitePage() {
    return (
        <Suspense fallback={
            <div className="flex-1 flex flex-col items-center justify-center bg-surface-1">
                <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
            </div>
        }>
            <AcceptInviteInner />
        </Suspense>
    );
}
