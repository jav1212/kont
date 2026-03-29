"use client";

// Guard component: renders children only when the tenant has an active accounting subscription.
// Shows a paywall prompt with a CTA to billing, consistent with the access-guard pattern.
import Link from 'next/link';
import { useModuleAccess } from '@/src/modules/billing/frontend/hooks/use-module-access';

interface Props {
    children: React.ReactNode;
}

export function AccountingAccessGuard({ children }: Props) {
    const { hasAccess, loading } = useModuleAccess('accounting');

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-full text-neutral-400 text-[13px] font-mono">
                Cargando...
            </div>
        );
    }

    if (!hasAccess) {
        return (
            <div className="flex flex-col items-center justify-center min-h-full gap-4 p-8 text-center">
                <p className="text-neutral-500 text-[13px] font-mono max-w-sm">
                    El módulo de Contabilidad no está disponible en tu suscripción actual.
                </p>
                <Link
                    href="/billing"
                    className="inline-flex items-center h-9 px-4 rounded-lg bg-primary-500 text-white font-mono text-[12px] uppercase tracking-[0.1em] hover:bg-primary-600 transition-colors duration-150"
                >
                    Ir a Facturación
                </Link>
            </div>
        );
    }

    return <>{children}</>;
}
