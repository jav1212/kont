import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import type { TooltipItem } from 'chart.js';
import { useBcvRates } from '@/src/modules/tools/frontend/hooks/use-bcv-rates';
import { normalizeCurrencyCode } from '../../shared/currency';
import type { ProductHistoryPoint } from '../../backend/domain/product-history';
import { CurrencyModuleSelector } from './currency-module-selector';

const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

export function ProductHistoryChart({ points }: { points: ProductHistoryPoint[] }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const chartRef = useRef<Chart | null>(null);
    const [currency, setCurrency] = useState('VES');
    const { rates, loading: ratesLoading } = useBcvRates();
    const options = useMemo(() => [...new Set(['VES', ...rates.map((rate) => normalizeCurrencyCode(rate.code))])], [rates]);
    const currencyOptions = useMemo(() => options.map((code) => {
        const matchingRate = rates.find((rate) => normalizeCurrencyCode(rate.code) === code);
        return { code, label: code === 'VES' ? 'Bolívares · VES' : `${code}${matchingRate?.country ? ` · ${matchingRate.country}` : ''}` };
    }), [options, rates]);
    const rate = currency === 'VES' ? 1 : rates.find((item) => normalizeCurrencyCode(item.code) === currency)?.sell ?? null;
    const dated = useMemo(() => points.filter((point) => Number.isFinite(point.vesAmount) && point.vesAmount >= 0), [points]);

    useEffect(() => {
        if (!canvasRef.current || dated.length === 0) return;
        chartRef.current?.destroy();
        const convert = (point: ProductHistoryPoint) => point.vesAmount / (rate && rate > 0 ? rate : 1);
        const purchasePoints = dated.map((point) => point.kind === 'purchase' ? point : null);
        const salePoints = dated.map((point) => point.kind === 'sale' ? point : null);
        const format = (value: number) => `${currency} ${value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        chartRef.current = new Chart(canvasRef.current, {
            type: 'line',
            data: {
                labels: dated.map((point) => dateLabel(point.date)),
                datasets: [
                    { label: 'Costo de compra', data: purchasePoints.map((point) => point ? convert(point) : null), borderColor: '#e74613', backgroundColor: '#e74613', pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5, tension: 0.2, spanGaps: false },
                    { label: 'Precio facturado', data: salePoints.map((point) => point ? convert(point) : null), borderColor: '#16a34a', backgroundColor: '#16a34a', pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5, tension: 0.2, spanGaps: false },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, padding: 18, font: { family: 'monospace', size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: (context: TooltipItem<'line'>) => `${context.dataset.label}: ${format(Number(context.parsed.y))}`,
                            afterLabel: (context: TooltipItem<'line'>) => {
                                const source = context.datasetIndex === 0 ? purchasePoints[context.dataIndex] : salePoints[context.dataIndex];
                                return source ? [`Original: ${source.currency} ${source.sourceAmount.toLocaleString('es-VE', { maximumFractionDigits: 2 })}`, `Cantidad: ${source.quantity.toLocaleString('es-VE')}`, source.reference ? `Ref.: ${source.reference}` : ''] : '';
                            },
                        },
                    },
                },
                scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { family: 'monospace', size: 10 } } },
                    y: { beginAtZero: false, grid: { color: 'rgba(100, 116, 139, 0.18)' }, ticks: { callback: (value: string | number) => `${currency} ${Number(value).toLocaleString('es-VE', { maximumFractionDigits: 2 })}`, font: { family: 'monospace', size: 10 } } },
                },
            },
        });
        return () => { chartRef.current?.destroy(); chartRef.current = null; };
    }, [currency, dated, rate]);

    if (dated.length === 0) return <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed border-border-light bg-surface-2 px-6 text-center font-sans text-[13px] text-[var(--text-secondary)]">No hay compras o ventas confirmadas para graficar.</div>;

    return <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Moneda de visualización</p><p className="mt-1 font-sans text-[12px] text-[var(--text-secondary)]">Valores convertidos desde VES con la tasa BCV vigente.</p></div>
            <CurrencyModuleSelector
                value={currency}
                options={currencyOptions}
                onChange={setCurrency}
                disabled={ratesLoading && rates.length === 0}
                className="w-full md:min-w-[260px] md:max-w-[360px]"
            />
        </div>
        {currency !== 'VES' && !rate && <p className="rounded-lg border border-amber-300/40 bg-amber-50/40 px-3 py-2 font-sans text-[12px] text-amber-800">No hay una tasa BCV disponible para {currency}.</p>}
        <div className="relative h-[360px] w-full rounded-lg border border-border-light bg-surface-2 p-3"><canvas ref={canvasRef} /></div>
    </div>;
}
