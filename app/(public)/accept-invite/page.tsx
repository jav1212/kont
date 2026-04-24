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
    MessageSquare,
    Share2,
    Heart,
    Sparkles,
    Zap
} from "lucide-react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { LogoMark } from "@/src/shared/frontend/components/logo";

const ERROR_MESSAGES: Record<string, string> = {
    invalid:        "La invitación es inválida o ya fue usada.",
    expired:        "La invitación ha expirado.",
    email_mismatch: "El email de la invitación no coincide con tu cuenta.",
    server:         "Ocurrió un error en el servidor. Intenta de nuevo.",
};

function AcceptInviteVisual() {
    return (
        <div className="hidden md:flex flex-1 relative p-6 items-center justify-center">
            <div className="w-full h-full rounded-[28px] relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-primary-500 via-primary-600 to-orange-600">
                <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-white/10 blur-[80px] pointer-events-none" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-black/20 blur-[80px] pointer-events-none" />
                <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

                <div className="relative z-10 flex flex-col items-center">
                    <div className="relative w-64 h-64 flex items-center justify-center mb-10">
                        <div className="absolute inset-0 rounded-full border border-white/20" />
                        <div className="absolute inset-8 rounded-full border border-white/15" />
                        <div className="relative z-10 w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-2xl">
                            <Users size={32} className="text-white" />
                        </div>
                        {[
                            { icon: <MessageSquare className="w-5 h-5 text-white" />, angle: 0   },
                            { icon: <Share2 className="w-5 h-5 text-white" />, angle: 60  },
                            { icon: <Heart className="w-5 h-5 text-white" />, angle: 120 },
                            { icon: <UserPlus className="w-5 h-5 text-white" />, angle: 180 },
                            { icon: <Sparkles className="w-5 h-5 text-white" />, angle: 240 },
                            { icon: <Zap className="w-5 h-5 text-white" />, angle: 300 },
                        ].map(({ icon, angle }) => {
                            const rad = (angle * Math.PI) / 180;
                            const r   = 104;
                            const x   = Math.round(Math.cos(rad) * r);
                            const y   = Math.round(Math.sin(rad) * r);
                            return (
                                <div key={angle} className="absolute w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg" style={{ transform: `translate(${x}px, ${y}px)` }}>
                                    {icon}
                                </div>
                            );
                        })}
                    </div>
                    <div className="text-center px-8 max-w-sm">
                        <h2 className="text-white text-[26px] font-black leading-tight mb-3">Trabajo en <span className="text-white/70">Equipo</span></h2>
                        <p className="text-white/60 text-[13px] leading-relaxed">Únete a tu organización en Kontave y colabora en tiempo real con todos tus colegas de forma segura.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PageWrapper({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 lg:px-20 overflow-y-auto hidden-scrollbar">
                <div className="w-full max-w-[400px]">
                    {children}
                </div>
            </div>
            <AcceptInviteVisual />
        </div>
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
            <PageWrapper>
                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
                        <ShieldAlert className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-[26px] font-bold text-foreground mb-3">Invitación Inválida</h1>
                    <p className="text-[14px] text-text-tertiary leading-relaxed mb-8">
                        {errorMsg ?? "Esta invitación de equipo no es válida o ha caducado."}
                    </p>
                    <BaseButton.Root as={Link} href="/" variant="primary" className="w-full h-11 rounded-xl text-[13px] font-bold">
                        Retornar al Inicio
                    </BaseButton.Root>
                </div>
            </PageWrapper>
        );
    }

    if (!token && !switchTenant) {
        return (
            <PageWrapper>
                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-6 border border-border-medium">
                        <Link2Off className="w-8 h-8 text-text-tertiary" />
                    </div>
                    <h1 className="text-[26px] font-bold text-foreground mb-3">Enlace Roto</h1>
                    <p className="text-[14px] text-text-tertiary leading-relaxed mb-8">
                        No se detectó un token de invitación válido en esta URL.
                    </p>
                    <BaseButton.Root as={Link} href="/" variant="outline" className="w-full h-11 rounded-xl text-[13px] font-bold">
                        Retornar al Inicio
                    </BaseButton.Root>
                </div>
            </PageWrapper>
        );
    }

    if (!authLoading && !isAuthenticated && token) {
        return (
            <PageWrapper>
                <div className="flex flex-col items-center text-center">
                    <div className="w-14 h-14 rounded-2xl bg-primary-500 flex items-center justify-center mb-6 shadow-lg shadow-primary-500/30">
                        <LogoMark size={24} className="text-white" />
                    </div>
                    <h1 className="text-[26px] font-bold text-foreground mb-3">Únete a Kontave</h1>
                    <p className="text-[14px] text-text-tertiary leading-relaxed mb-10 max-w-[300px]">
                        Se ha solicitado tu colaboración. Crea tu cuenta o inicia sesión para aceptar la invitación al equipo.
                    </p>
                    <div className="w-full space-y-3">
                        <BaseButton.Root as={Link} href={`/sign-up?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`} variant="primary" className="w-full h-12 rounded-xl text-[14px] font-bold gap-2">
                            <UserPlus className="w-4 h-4" /> Crear Cuenta gratis
                        </BaseButton.Root>
                        <BaseButton.Root as={Link} href={`/sign-in?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`} variant="outline" className="w-full h-12 rounded-xl text-[14px] font-bold gap-2">
                            <LogIn className="w-4 h-4" /> Ya tengo cuenta
                        </BaseButton.Root>
                    </div>
                </div>
            </PageWrapper>
        );
    }

    return (
        <div className="flex-1 flex flex-col items-center justify-center bg-surface-1">
            <div className="flex flex-col items-center gap-6">
                <div className="relative">
                    <div className="w-20 h-20 rounded-full border-4 border-primary-500/20 flex items-center justify-center animate-spin-slow">
                        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <LogoMark size={24} className="text-primary-500/30" />
                    </div>
                </div>
                <div className="text-center">
                    <h3 className="text-[18px] font-bold text-foreground mb-1">Cargando Invitación</h3>
                    <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-text-tertiary animate-pulse">Sincronizando con el servidor…</p>
                </div>
            </div>
        </div>
    );
}

export default function AcceptInvitePage() {
    return (
        <Suspense fallback={
            <div className="flex-1 flex flex-col items-center justify-center bg-surface-1">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
                </div>
            </div>
        }>
            <AcceptInviteInner />
        </Suspense>
    );
}
