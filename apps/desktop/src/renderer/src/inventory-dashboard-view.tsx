import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, RefreshCw, Repeat2 } from "lucide-react";
import { Button, CurrencyFlag, DatePeriodPicker, OptionPicker, Skeleton, presentFeedback } from "@kontave/ui-dom";
import { codedErrorFeedback } from "@kontave/client-feedback-application";
import type { NativeInventoryDashboardChartPointDto, NativeRecentInventoryMovementDto } from "@kontave/native-api-contracts";
import type { DesktopAuthState, DesktopInventoryDashboardQuery, DesktopInventoryDashboardSnapshot } from "../../shared/desktop-api.js";

interface InventoryDashboardViewProps {
  readonly auth: Extract<DesktopAuthState, { status: "authenticated" }>;
  readonly organizationId: string;
  readonly companyId: string;
}

export function InventoryDashboardView({ auth, companyId, organizationId }: InventoryDashboardViewProps) {
  const [snapshot, setSnapshot] = useState<DesktopInventoryDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [displayCurrency, setDisplayCurrency] = useState("VES");
  const load = (query?: DesktopInventoryDashboardQuery): void => {
    setLoading(true);
    void window.kontave.inventory.getDashboard(auth.user.id, organizationId, companyId, query).then((result) => {
      if (result.ok) {
        setSnapshot(result.value);
        setSelectedMonth(result.value.dashboard.period.from.slice(0, 7));
      }
      else presentFeedback.execute(codedErrorFeedback({
        code: result.error.requestId ?? result.error.code,
        message: result.error.message,
        deduplicationKey: `inventory-dashboard-${result.error.requestId ?? result.error.code}`,
      }));
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    void window.kontave.inventory.getDashboard(auth.user.id, organizationId, companyId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setSnapshot(result.value);
        setSelectedMonth(result.value.dashboard.period.from.slice(0, 7));
      }
      else presentFeedback.execute(codedErrorFeedback({
        code: result.error.requestId ?? result.error.code,
        message: result.error.message,
        deduplicationKey: `inventory-dashboard-${result.error.requestId ?? result.error.code}`,
      }));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [auth.user.id, companyId, organizationId]);

  if (loading && !snapshot) return <InventoryDashboardSkeleton />;
  if (!snapshot) return <div className="inventory-dashboard-empty"><Boxes /><h2>El tablero no está disponible</h2><p>Vuelve a intentarlo para consultar el inventario de esta empresa.</p><Button onClick={() => load()}>Reintentar</Button></div>;

  const { dashboard, operationContext } = snapshot;
  const summary = dashboard.summary;
  const exchangeRate = snapshot.exchangeRates.rates.find(({ baseCurrency }) => baseCurrency === displayCurrency) ?? null;
  const currencyOptions = [
    { value: "VES", label: "Bolívar venezolano", description: "Moneda base del inventario", icon: <CurrencyFlag currency="VES" /> },
    ...snapshot.exchangeRates.rates.map((rate) => ({
      value: rate.baseCurrency,
      label: currencyName(rate.baseCurrency),
      description: `1 ${rate.baseCurrency} = ${formatRate(rate.value)} VES`,
      icon: <CurrencyFlag currency={rate.baseCurrency} />,
    })),
  ];
  const formatDashboardAmount = (value: string): string => formatAmount(value, displayCurrency, exchangeRate);
  const selectMonth = (month: string): void => {
    setSelectedMonth(month);
    load(monthQuery(month, operationContext.effectiveDate));
  };
  return <section className="inventory-dashboard">
    <div className="inventory-dashboard__heading">
      <div><h2>Tablero de inventario</h2><p>Actividad y valoración de la empresa seleccionada.</p></div>
      <div className="inventory-dashboard__context">
        <DatePeriodPicker label="Período mensual" value={selectedMonth} max={operationContext.effectiveDate.slice(0, 7)} onChange={selectMonth} />
        <OptionPicker label="Moneda de presentación" value={displayCurrency} options={currencyOptions} searchable searchPlaceholder="Buscar moneda..." onChange={setDisplayCurrency} />
        <Button appearance="unstyled" className="inventory-dashboard__refresh" aria-label="Actualizar tablero" title="Actualizar tablero" onClick={() => load(monthQuery(selectedMonth, operationContext.effectiveDate))}><RefreshCw /></Button>
      </div>
    </div>

    <div className="inventory-dashboard__metrics">
      <Metric icon={<ArrowDownToLine />} tone="blue" label="Valor de entradas" value={formatDashboardAmount(summary.inboundValue.amount)} />
      <Metric icon={<ArrowUpFromLine />} tone="violet" label="Valor de salidas" value={formatDashboardAmount(summary.outboundValue.amount)} />
      <Metric icon={<Repeat2 />} tone="pink" label="Movimientos" value={summary.movementCount.toLocaleString("es-VE")} />
      <Metric icon={<Boxes />} tone="cyan" label="Valor del inventario" value={formatDashboardAmount(summary.inventoryValue.amount)} />
    </div>

    <div className="inventory-dashboard__charts">
      <ChartCard title="Entradas vs. salidas"><FlowChart points={dashboard.charts} /></ChartCard>
      <ChartCard title="Valor de entradas"><BarChart points={dashboard.charts} field="inboundValue" /></ChartCard>
      <ChartCard title="Cantidad de movimientos"><BarChart points={dashboard.charts} field="movementCount" /></ChartCard>
    </div>

    <div className="inventory-dashboard__tables">
      <MovementTable title="Últimas salidas" empty="No hay salidas en este período." movements={dashboard.recentOutboundMovements} formatValue={formatDashboardAmount} />
      <MovementTable title="Últimas entradas" empty="No hay entradas en este período." movements={dashboard.recentInboundMovements} formatValue={formatDashboardAmount} />
    </div>
  </section>;
}

function Metric({ icon, label, tone, value }: { readonly icon: React.ReactNode; readonly label: string; readonly tone: string; readonly value: string }) {
  return <article className="inventory-metric"><span className={`inventory-metric__icon inventory-metric__icon--${tone}`}>{icon}</span><div><strong>{value}</strong><span>{label}</span></div></article>;
}

function ChartCard({ children, title }: { readonly children: React.ReactNode; readonly title: string }) {
  return <article className="inventory-chart-card"><header><h3>{title}</h3></header>{children}</article>;
}

function FlowChart({ points }: { readonly points: readonly NativeInventoryDashboardChartPointDto[] }) {
  const width = 320; const height = 128;
  const values = points.flatMap((point) => [Number(point.inboundValue.amount), Number(point.outboundValue.amount)]);
  const max = Math.max(1, ...values);
  const path = (field: "inboundValue" | "outboundValue") => points.map((point, index) => {
    const x = points.length <= 1 ? width / 2 : index * width / (points.length - 1);
    const y = height - Number(point[field].amount) / max * (height - 18) - 8;
    return `${x},${y}`;
  }).join(" ");
  if (!points.length) return <ChartEmpty />;
  return <div className="inventory-chart"><div className="inventory-chart__legend"><span className="is-inbound">Entradas</span><span className="is-outbound">Salidas</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Entradas y salidas del período"><polyline className="is-inbound" points={path("inboundValue")} /><polyline className="is-outbound" points={path("outboundValue")} /></svg><ChartLabels points={points} /></div>;
}

function BarChart({ field, points }: { readonly field: "inboundValue" | "movementCount"; readonly points: readonly NativeInventoryDashboardChartPointDto[] }) {
  const values = points.map((point) => field === "movementCount" ? point.movementCount : Number(point.inboundValue.amount));
  const max = Math.max(1, ...values);
  if (!points.length) return <ChartEmpty />;
  return <div className="inventory-chart inventory-chart--bars"><div className="inventory-chart__bars">{values.map((value, index) => <span key={points[index]?.date} style={{ height: `${Math.max(3, value / max * 100)}%` }} />)}</div><ChartLabels points={points} /></div>;
}

function ChartLabels({ points }: { readonly points: readonly NativeInventoryDashboardChartPointDto[] }) {
  const visible = useMemo(() => points.length <= 6 ? points : points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 5) === 0), [points]);
  return <div className="inventory-chart__labels">{visible.map((point) => <span key={point.date}>{formatShortDate(point.date)}</span>)}</div>;
}

function ChartEmpty() { return <div className="inventory-chart__empty">Sin actividad en el período</div>; }

function MovementTable({ movements, empty, formatValue, title }: { readonly movements: readonly NativeRecentInventoryMovementDto[]; readonly empty: string; readonly formatValue: (value: string) => string; readonly title: string }) {
  return <article className="inventory-documents"><header><h3>{title}</h3></header>{movements.length ? <div className="inventory-documents__list">{movements.map((movement) => <div key={movement.id}><div><strong>{movement.productName}</strong><span>{[movement.productSku || null, movementTypeLabel(movement.movementType), movement.reference].filter(Boolean).join(" · ")}</span></div><div><strong>{formatValue(movement.totalCost.amount)}</strong><span>{formatDecimalQuantity(movement.quantity.value)} {unitLabel(movement.quantity.unit)} · {formatShortDate(movement.effectiveDate)}</span></div></div>)}</div> : <p className="inventory-documents__empty">{empty}</p>}</article>;
}

function InventoryDashboardSkeleton() {
  return <section className="inventory-dashboard" aria-busy="true"><div className="inventory-dashboard__heading"><div><Skeleton variant="text" width={220} height={28} /><Skeleton variant="text" width={300} height={14} /></div><Skeleton variant="control" width={210} height={40} /></div><div className="inventory-dashboard__metrics">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="rectangle" width="100%" height={92} />)}</div><div className="inventory-dashboard__charts">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} variant="rectangle" width="100%" height={250} />)}</div><div className="inventory-dashboard__tables">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} variant="rectangle" width="100%" height={250} />)}</div></section>;
}

function formatAmount(value: string, currency: string, rate: { readonly value: string } | null): string {
  const numericRate = rate ? Number(rate.value) : null;
  const amount = currency !== "VES" && numericRate && numericRate > 0 ? Number(value) / numericRate : Number(value);
  return new Intl.NumberFormat("es-VE", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}
function formatShortDate(value: string): string { return new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function movementTypeLabel(value:string):string{return({entrada:"Entrada",entrada_compra:"Entrada",entrada_produccion:"Entrada de producción",ajuste_positivo:"Ajuste positivo",devolucion_salida:"Devolución de salida",devolucion_venta:"Devolución",salida:"Salida",salida_venta:"Salida",salida_produccion:"Salida de producción",ajuste_negativo:"Ajuste negativo",devolucion_entrada:"Devolución de entrada",devolucion_compra:"Devolución",autoconsumo:"Autoconsumo"}as Record<string,string>)[value]??value;}
function formatDecimalQuantity(value:string):string{const [integer="0",fraction=""]=value.split(".");const sign=integer.startsWith("-")?"-":"";const digits=integer.replace("-","").replace(/^0+(?=\d)/,"");const grouped=digits.replace(/\B(?=(\d{3})+(?!\d))/g,".");const decimals=fraction.replace(/0+$/,"");return `${sign}${grouped}${decimals?`,${decimals}`:""}`;}
function unitLabel(value:NativeRecentInventoryMovementDto["quantity"]["unit"]):string{return({each:"unid.",kilogram:"kg",gram:"g",meter:"m",square_meter:"m²",cubic_meter:"m³",liter:"l",gallon:"gal",box:"caja",roll:"rollo",package:"paquete"})[value];}
function formatRate(value: string): string { return new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(Number(value)); }
function currencyName(code: string): string {
  return new Intl.DisplayNames(["es-VE"], { type: "currency" }).of(code) ?? code;
}

function monthQuery(month: string, effectiveDate: string): DesktopInventoryDashboardQuery {
  const from = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { from, to: effectiveDate.startsWith(month) && effectiveDate < monthEnd ? effectiveDate : monthEnd };
}
