"use client";

// Accounting module dashboard.
// Entry point for the accounting area — shows a quick-access grid to main sub-sections,
// with the current open period surfaced as a contextual status banner.
import Link                           from 'next/link';
import { PageHeader }                 from '@/src/shared/frontend/components/page-header';
import { AccountingAccessGuard }      from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { useCompany }                 from '@/src/modules/companies/frontend/hooks/use-companies';
import { useAccountingPeriods }       from '@/src/modules/accounting/frontend/hooks/use-accounting-periods';

const NAV_CARDS = [
    { href: '/accounting/accounts',      label: 'Plan de Cuentas',         description: 'Catálogo jerárquico de cuentas contables' },
    { href: '/accounting/periods',       label: 'Períodos',                description: 'Administrar períodos contables abiertos y cerrados' },
    { href: '/accounting/journal',       label: 'Libro Diario',            description: 'Crear y consultar asientos contables' },
    { href: '/accounting/trial-balance', label: 'Balance de Comprobación', description: 'Resumen de débitos, créditos y saldos por cuenta' },
    { href: '/accounting/integrations',  label: 'Integraciones',           description: 'Configurar asientos automáticos desde Nómina e Inventario' },
];

export default function AccountingDashboard() {
    const { companyId }     = useCompany();
    const { data: periods } = useAccountingPeriods(companyId);
    const openPeriods       = periods.filter((p) => p.status === 'open');

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full">
                <PageHeader title="Contabilidad" />

                <div className="flex flex-col gap-6 p-8">
                    {openPeriods.length > 0 && (
                        <div className="inline-flex items-center gap-2 self-start px-3 py-2 rounded-lg border border-border-light bg-surface-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                            <span className="font-mono text-[12px] text-neutral-500">
                                Período activo:{' '}
                                <span className="font-semibold text-foreground">{openPeriods[0].name}</span>
                            </span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                        {NAV_CARDS.map((card) => (
                            <Link
                                key={card.href}
                                href={card.href}
                                className="flex flex-col gap-1.5 p-4 rounded-xl border border-border-light bg-surface-1 hover:border-border-medium hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                            >
                                <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.1em] text-foreground">
                                    {card.label}
                                </span>
                                <span className="font-mono text-[12px] text-neutral-500">
                                    {card.description}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </AccountingAccessGuard>
    );
}
