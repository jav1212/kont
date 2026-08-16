import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign, FileClock, FileText, ReceiptText, RefreshCw, ShoppingCart } from "lucide-react";
import { currency, divideDecimal, exactDecimal, moneyFromDecimal, moneyToDecimal, quantizeMoney } from "@kontave/monetary-domain";
import { Button, CurrencyFlag, DatePeriodPicker, OptionPicker, Skeleton, Text, presentFeedback } from "@kontave/ui-dom";
import { codedErrorFeedback } from "@kontave/client-feedback-application";
import type { NativeSalesDashboardDailyPointDto, NativeSalesDashboardDocumentDto } from "@kontave/native-api-contracts";
import type { DesktopAuthState, DesktopSalesDashboardQuery, DesktopSalesDashboardSnapshot } from "../../shared/desktop-api";

interface Props {
  readonly auth: Extract<DesktopAuthState, { status: "authenticated" }>;
  readonly organizationId: string;
  readonly companyId: string;
}

export function SalesDashboardView({ auth, organizationId, companyId }: Props) {
  const [snapshot, setSnapshot] = useState<DesktopSalesDashboardSnapshot>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [month, setMonth] = useState("");
  const [displayCurrency, setDisplayCurrency] = useState("VES");

  const accept = (value: DesktopSalesDashboardSnapshot): void => {
    setSnapshot(value);
    setMonth(value.dashboard.period.from.slice(0, 7));
    const preferred = value.operationContext.presentationCurrency;
    setDisplayCurrency(preferred === "VES" || value.exchangeRates.rates.some((rate) => rate.baseCurrency === preferred) ? preferred : "VES");
  };
  const reject = (failure: { readonly code: string; readonly message: string; readonly requestId: string | null }): void => {
    setError(failure.message);
    presentFeedback.execute(codedErrorFeedback({
      code: failure.requestId ?? failure.code,
      message: failure.message,
      deduplicationKey: `sales-dashboard-${failure.requestId ?? failure.code}`,
    }));
  };
  const load = (query?: DesktopSalesDashboardQuery): void => {
    setRefreshing(true);
    setError(undefined);
    void window.kontave.sales.getDashboard(auth.user.id, organizationId, companyId, query)
      .then((result) => result.ok ? accept(result.value) : reject(result.error))
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    let active = true;
    void window.kontave.sales.getDashboard(auth.user.id, organizationId, companyId).then((result) => {
      if (!active) return;
      if (result.ok) accept(result.value); else reject(result.error);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [auth.user.id, organizationId, companyId]);

  if (loading && !snapshot) return <DashboardSkeleton />;
  if (!snapshot) return <div className="inventory-dashboard-empty" role="alert" aria-busy={refreshing}><ShoppingCart /><h2>El tablero no está disponible</h2><Text>{error ?? "No fue posible consultar las ventas de esta empresa."}</Text><Button disabled={refreshing} onClick={() => load()}>{refreshing ? "Reintentando…" : "Reintentar"}</Button></div>;

  const { dashboard, operationContext, exchangeRates } = snapshot;
  const rate = exchangeRates.rates.find((item) => item.baseCurrency === displayCurrency) ?? null;
  const format = (amount: string): string => formatPresentation(amount, displayCurrency, rate?.value ?? null);
  const options = [
    { value: "VES", label: "Bolívar venezolano", description: "Moneda funcional", icon: <CurrencyFlag currency="VES" /> },
    ...exchangeRates.rates.map((item) => ({ value: item.baseCurrency, label: currencyName(item.baseCurrency), description: `1 ${item.baseCurrency} = ${item.value} VES`, icon: <CurrencyFlag currency={item.baseCurrency} /> })),
  ];
  const empty = dashboard.summary.confirmedInvoiceCount === 0 && dashboard.summary.draftInvoiceCount === 0;
  return <section className="inventory-dashboard" aria-busy={refreshing}>
    <div className="inventory-dashboard__heading"><div><h2>Tablero de ventas</h2><Text>Facturación fiscal emitida y borradores pendientes.</Text></div><div className="inventory-dashboard__context">
      <DatePeriodPicker label="Período mensual" value={month} max={operationContext.effectiveDate.slice(0, 7)} onChange={(value) => { setMonth(value); load(monthQuery(value, operationContext.effectiveDate)); }} />
      <OptionPicker label="Moneda de presentación" value={displayCurrency} options={options} searchable searchPlaceholder="Buscar moneda..." onChange={setDisplayCurrency} />
      <Button appearance="unstyled" className="inventory-dashboard__refresh" aria-label="Actualizar tablero de ventas" disabled={refreshing} onClick={() => load(monthQuery(month, operationContext.effectiveDate))}><RefreshCw /></Button>
    </div></div>
    {error ? <div role="alert" className="sales-dashboard__inline-error"><Text>{error}</Text><Button size="sm" onClick={() => load(monthQuery(month, operationContext.effectiveDate))}>Reintentar</Button></div> : null}
    <div className="inventory-dashboard__metrics">
      <Metric icon={<CircleDollarSign />} tone="blue" label="Total facturado" value={format(dashboard.summary.confirmedInvoicedAmount.amount)} />
      <Metric icon={<ReceiptText />} tone="violet" label="IVA débito fiscal" value={format(dashboard.summary.vatDebitAmount.amount)} />
      <Metric icon={<FileText />} tone="pink" label="Ventas confirmadas" value={dashboard.summary.confirmedInvoiceCount.toLocaleString("es-VE")} />
      <Metric icon={<ShoppingCart />} tone="cyan" label="Ticket promedio" value={format(dashboard.summary.averageTicketAmount.amount)} />
    </div>
    <div className="sales-dashboard__draft-indicator"><FileClock /><Text>{dashboard.summary.draftInvoiceCount.toLocaleString("es-VE")} borradores pendientes de confirmar</Text></div>
    {empty ? <div className="inventory-dashboard-empty"><ShoppingCart /><h2>Sin ventas en este período</h2><Text>No hay facturas ni borradores registrados para el mes seleccionado.</Text></div> : <><div className="inventory-dashboard__charts">
      <Chart title="Facturación diaria"><Bars points={dashboard.charts} value={(point) => point.confirmedInvoicedAmount.amount} /></Chart>
      <Chart title="Cantidad diaria de ventas"><Bars points={dashboard.charts} value={(point) => String(point.confirmedInvoiceCount)} /></Chart>
      <Chart title="Base imponible e IVA"><DualBars points={dashboard.charts} /></Chart>
    </div><div className="inventory-dashboard__tables">
      <Documents title="Ventas recientes" rows={dashboard.recentConfirmedInvoices} format={format} />
      <Documents title="Borradores recientes" rows={dashboard.recentDraftInvoices} format={format} />
    </div></>}
  </section>;
}

function Metric({ icon, tone, label, value }: { readonly icon: React.ReactNode; readonly tone: string; readonly label: string; readonly value: string }) { return <article className="inventory-metric"><div className={`inventory-metric__icon inventory-metric__icon--${tone}`}>{icon}</div><div><strong>{value}</strong><Text>{label}</Text></div></article>; }
function Chart({ title, children }: { readonly title: string; readonly children: React.ReactNode }) { return <article className="inventory-chart-card" aria-label={`${title}. Los valores diarios también están disponibles en las tablas y los indicadores del tablero.`}><header><h3>{title}</h3></header>{children}</article>; }
// Number is intentionally confined to SVG/CSS proportions; displayed money stays exact.
function Bars({ points, value }: { readonly points: readonly NativeSalesDashboardDailyPointDto[]; readonly value: (point: NativeSalesDashboardDailyPointDto) => string }) { const values = points.map((point) => Number(value(point))), max = Math.max(1, ...values); return <div className="inventory-chart inventory-chart--bars" role="img" aria-label={`Serie diaria de ${points.length} días`}><div className="inventory-chart__bars">{values.map((item, index) => <i key={points[index]?.date} style={{ height: `${Math.max(3, item / max * 100)}%` }} />)}</div><Labels points={points} /></div>; }
function DualBars({ points }: { readonly points: readonly NativeSalesDashboardDailyPointDto[] }) { const max = Math.max(1, ...points.flatMap((point) => [Number(point.taxableBaseAmount.amount), Number(point.vatDebitAmount.amount)])); return <div className="inventory-chart inventory-chart--bars" role="img" aria-label={`Comparación diaria de base imponible e IVA para ${points.length} días`}><div className="sales-chart__legend"><Text>Base</Text><Text>IVA</Text></div><div className="inventory-chart__bars sales-chart__dual">{points.map((point) => <div key={point.date}><i style={{ height: `${Math.max(3, Number(point.taxableBaseAmount.amount) / max * 100)}%` }} /><i style={{ height: `${Math.max(3, Number(point.vatDebitAmount.amount) / max * 100)}%` }} /></div>)}</div><Labels points={points} /></div>; }
function Labels({ points }: { readonly points: readonly NativeSalesDashboardDailyPointDto[] }) { const visible = useMemo(() => points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 5) === 0), [points]); return <div className="inventory-chart__labels">{visible.map((point) => <Text key={point.date}>{new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${point.date}T00:00:00Z`))}</Text>)}</div>; }
function Documents({ title, rows, format }: { readonly title: string; readonly rows: readonly NativeSalesDashboardDocumentDto[]; readonly format: (value: string) => string }) { return <article className="inventory-documents"><header><h3>{title}</h3></header>{rows.length ? <div className="sales-documents__table"><table><thead><tr><th>Factura</th><th>Cliente</th><th>Fecha</th><th>Total</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.invoiceNumber}</td><td>{row.customerName ?? "Consumidor final"}</td><td>{row.date}</td><td>{format(row.total.amount)}</td></tr>)}</tbody></table></div> : <Text className="inventory-documents__empty">No hay documentos en este período.</Text>}</article>; }

function formatPresentation(value: string, code: string, rate: string | null): string {
  const ves = currency("VES", 2);
  if (code !== "VES" && rate === null) return "—";
  const target = currency(code, 2);
  const converted = code === "VES"
    ? moneyFromDecimal(value, ves)
    : quantizeMoney(divideDecimal(moneyToDecimal(moneyFromDecimal(value, ves)), exactDecimal(rate as string)), target, "half_up");
  return `${formatExactDecimal(moneyToDecimal(converted))} ${code}`;
}
function formatExactDecimal(value: string): string {
  const [rawInteger = "0", fraction = ""] = value.split(".");
  const negative = rawInteger.startsWith("-");
  const integer = rawInteger.replace(/^[+-]/, "").replace(/^0+(?=\d)/, "");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped},${fraction.padEnd(2, "0")}`;
}
function currencyName(code: string): string { return new Intl.DisplayNames(["es-VE"], { type: "currency" }).of(code) ?? code; }
function monthQuery(month: string, effective: string): DesktopSalesDashboardQuery { const [year, number] = month.split("-").map(Number) as [number, number], end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10); return { from: `${month}-01`, to: effective.startsWith(month) && effective < end ? effective : end }; }
function DashboardSkeleton() { return <section className="inventory-dashboard" aria-busy="true"><div className="inventory-dashboard__heading"><Skeleton variant="text" width={240} /><Skeleton variant="control" width={360} /></div><div className="inventory-dashboard__metrics">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="rectangle" width="100%" height={92} />)}</div></section>; }
