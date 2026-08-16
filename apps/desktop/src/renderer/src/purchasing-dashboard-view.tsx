import { useEffect, useState } from "react";
import { BadgeDollarSign, FileCheck2, FilePenLine, ReceiptText, RefreshCw, ShoppingBasket } from "lucide-react";
import { Button, CurrencyFlag, DatePeriodPicker, OptionPicker, Skeleton, presentFeedback } from "@kontave/ui-dom";
import { codedErrorFeedback } from "@kontave/client-feedback-application";
import type { NativePurchasingDashboardDayDto } from "@kontave/native-api-contracts";
import type { DesktopAuthState, DesktopPurchasingDashboardQuery, DesktopPurchasingDashboardSnapshot } from "../../shared/desktop-api";

interface Failure { readonly code: string; readonly message: string; readonly requestId: string | null }
interface Props { readonly auth: Extract<DesktopAuthState, { status: "authenticated" }>; readonly organizationId: string; readonly companyId: string }
type ViewState = "initial-loading" | "ready" | "empty" | "failed";

export function PurchasingDashboardView({ auth, organizationId, companyId }: Props) {
  const [snapshot, setSnapshot] = useState<DesktopPurchasingDashboardSnapshot | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("");
  const [currency, setCurrency] = useState("VES");

  const load = (query?: DesktopPurchasingDashboardQuery): void => {
    setLoading(true); setFailure(null);
    void window.kontave.purchasing.getDashboard(auth.user.id, organizationId, companyId, query).then((result) => {
      if (result.ok) { setSnapshot(result.value); setMonth(result.value.dashboard.period.from.slice(0, 7)); return; }
      setFailure(result.error); present(result.error);
    }).catch((cause: unknown) => {
      const error = unexpectedFailure(cause); setFailure(error); present(error);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    void window.kontave.purchasing.getDashboard(auth.user.id, organizationId, companyId).then((result) => {
      if (!active) return;
      if (result.ok) { setSnapshot(result.value); setMonth(result.value.dashboard.period.from.slice(0, 7)); return; }
      setFailure(result.error); present(result.error);
    }).catch((cause: unknown) => {
      if (!active) return; const error = unexpectedFailure(cause); setFailure(error); present(error);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [auth.user.id, organizationId, companyId]);

  const viewState: ViewState = loading && !snapshot
    ? "initial-loading"
    : !snapshot
      ? "failed"
      : snapshot.dashboard.summary.confirmedDocumentCount === 0 && snapshot.dashboard.summary.draftDocumentCount === 0
        ? "empty"
        : "ready";
  if (viewState === "initial-loading") return <SkeletonView />;
  if (viewState === "failed" || !snapshot) return <ErrorView failure={failure} retry={() => load()} />;

  const { dashboard, operationContext, exchangeRates } = snapshot;
  const rate = exchangeRates.rates.find((item) => item.baseCurrency === currency) ?? null;
  const presentationCurrency = currency === "VES" || rate ? currency : "VES";
  const format = (value: string) => formatMoney(value, presentationCurrency, rate?.value ?? null);
  const options = [
    { value: "VES", label: "Bolívar venezolano", description: "Moneda funcional", icon: <CurrencyFlag currency="VES" /> },
    ...exchangeRates.rates.map((item) => ({ value: item.baseCurrency, label: currencyName(item.baseCurrency), description: `1 ${item.baseCurrency} = ${formatRate(item.value)} VES`, icon: <CurrencyFlag currency={item.baseCurrency} /> })),
  ];
  const selectMonth = (value: string): void => { setMonth(value); load(monthQuery(value)); };

  return <section className="inventory-dashboard">
    <div className="inventory-dashboard__heading">
      <div><h2>Tablero de compras</h2><p>Documentos recibidos, costo funcional e impacto fiscal.</p></div>
      <div className="inventory-dashboard__context">
        <DatePeriodPicker label="Período mensual" value={month} max={operationContext.effectiveDate.slice(0, 7)} onChange={selectMonth} />
        <OptionPicker label="Moneda de presentación" value={presentationCurrency} options={options} searchable searchPlaceholder="Buscar moneda..." onChange={setCurrency} />
        <Button appearance="unstyled" className="inventory-dashboard__refresh" aria-label="Actualizar tablero" onClick={() => load(monthQuery(month))}><RefreshCw /></Button>
      </div>
    </div>
    {viewState === "empty" ? <div className="inventory-dashboard-empty"><ReceiptText /><h2>Sin compras en este período</h2><p>Cuando existan facturas o borradores aparecerán aquí.</p></div> : <>
      <div className="inventory-dashboard__metrics">
        <Metric icon={<BadgeDollarSign />} label="Compras confirmadas" value={format(dashboard.summary.confirmedPurchaseTotal.amount)} />
        <Metric icon={<ReceiptText />} label="Crédito fiscal IVA" value={format(dashboard.summary.vatCreditTotal.amount)} />
        <Metric icon={<FileCheck2 />} label="IVA retenido" value={format(dashboard.summary.vatWithheldTotal.amount)} />
        <Metric icon={<FileCheck2 />} label="Documentos confirmados" value={dashboard.summary.confirmedDocumentCount.toLocaleString("es-VE")} />
        <Metric icon={<FilePenLine />} label="Borradores" value={dashboard.summary.draftDocumentCount.toLocaleString("es-VE")} />
      </div>
      <div className="inventory-dashboard__charts">
        <Chart title="Compras e IVA"><MoneyChart points={dashboard.daily} /></Chart>
        <Chart title="Documentos diarios"><DocumentChart points={dashboard.daily} /></Chart>
      </div>
      <div className="inventory-dashboard__tables">
        <article className="inventory-documents"><header><h3>Principales proveedores</h3></header>{dashboard.topSuppliers.length ? <div className="inventory-documents__list">{dashboard.topSuppliers.map((item, index) => <div key={item.supplier.id ?? `unknown-${index}`}><div><strong>{item.supplier.legalName}</strong><span>{item.supplier.taxIdentifier ?? "Sin RIF"}</span></div><div><strong>{format(item.confirmedPurchaseTotal.amount)}</strong><span>{item.confirmedDocumentCount} documentos</span></div></div>)}</div> : <p className="inventory-documents__empty">Sin proveedores confirmados.</p>}</article>
        <article className="inventory-documents"><header><h3>Facturas recientes</h3></header>{dashboard.recentDocuments.length ? <div className="inventory-documents__list">{dashboard.recentDocuments.map((item) => <div key={item.id}><div><strong>{item.supplier.legalName}</strong><span>{documentLabel(item.documentType)} · {item.invoiceNumber || "Sin número"} · {item.transactionCurrency}</span></div><div><strong>{format(item.functionalAmounts.total.amount)}</strong><span>{originalTotal(item)}{item.status === "confirmed" ? "Confirmada" : "Borrador"} · {shortDate(item.fiscalDate)}</span></div></div>)}</div> : <p className="inventory-documents__empty">Sin facturas recientes.</p>}</article>
      </div>
    </>}
  </section>;
}

function Metric({ icon, label, value }: { readonly icon: React.ReactNode; readonly label: string; readonly value: string }) { return <article className="inventory-metric"><span className="inventory-metric__icon inventory-metric__icon--blue">{icon}</span><div><strong>{value}</strong><span>{label}</span></div></article>; }
function Chart({ title, children }: { readonly title: string; readonly children: React.ReactNode }) { return <article className="inventory-chart-card"><header><h3>{title}</h3></header>{children}</article>; }
function MoneyChart({ points }: { readonly points: readonly NativePurchasingDashboardDayDto[] }) {
  const values = points.flatMap((point) => [Number(point.confirmedPurchaseTotal.amount), Number(point.vatCreditTotal.amount)]);
  const minimum = Math.min(0, ...values); const maximum = Math.max(0, ...values); const span = Math.max(1, maximum - minimum);
  const y = (value: number) => 120 - (value - minimum) / span * 105;
  const path = (field: "confirmedPurchaseTotal" | "vatCreditTotal") => points.map((point, index) => `${points.length < 2 ? 160 : index * 320 / (points.length - 1)},${y(Number(point[field].amount))}`).join(" ");
  return <div className="inventory-chart"><div className="inventory-chart__legend"><span className="is-inbound">Compras</span><span className="is-outbound">IVA</span></div><svg viewBox="0 0 320 128" role="img" aria-label="Compras e IVA diarios"><line x1="0" x2="320" y1={y(0)} y2={y(0)} stroke="currentColor" opacity="0.18" /><polyline className="is-inbound" points={path("confirmedPurchaseTotal")} /><polyline className="is-outbound" points={path("vatCreditTotal")} /></svg></div>;
}
function DocumentChart({ points }: { readonly points: readonly NativePurchasingDashboardDayDto[] }) { const max = Math.max(1, ...points.flatMap((point) => [point.confirmedDocumentCount, point.draftDocumentCount])); const path = (field: "confirmedDocumentCount" | "draftDocumentCount") => points.map((point, index) => `${points.length < 2 ? 160 : index * 320 / (points.length - 1)},${120 - point[field] / max * 105}`).join(" "); return <div className="inventory-chart"><div className="inventory-chart__legend"><span className="is-inbound">Confirmados</span><span className="is-outbound">Borradores</span></div><svg viewBox="0 0 320 128" role="img" aria-label="Documentos confirmados y borradores por día"><polyline className="is-inbound" points={path("confirmedDocumentCount")} /><polyline className="is-outbound" points={path("draftDocumentCount")} /></svg></div>; }
function SkeletonView() { return <section className="inventory-dashboard" aria-busy="true"><div className="inventory-dashboard__heading"><div><Skeleton variant="text" width={220} height={28} /><Skeleton variant="text" width={300} height={14} /></div></div><div className="inventory-dashboard__metrics">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} variant="rectangle" width="100%" height={92} />)}</div></section>; }
function ErrorView({ failure, retry }: { readonly failure: Failure | null; readonly retry: () => void }) { return <div className="inventory-dashboard-empty"><ShoppingBasket /><h2>El tablero no está disponible</h2><p>{failure?.message ?? "Vuelve a intentarlo para consultar las compras de esta empresa."}</p>{failure?.requestId ? <small>Solicitud: {failure.requestId}</small> : null}<Button onClick={retry}>Reintentar</Button></div>; }
function present(error: Failure) { presentFeedback.execute(codedErrorFeedback({ code: error.requestId ?? error.code, message: error.message, deduplicationKey: `purchasing-dashboard-${error.requestId ?? error.code}` })); }
function unexpectedFailure(cause: unknown): Failure { return { code: "PURCHASING_DASHBOARD_UNAVAILABLE", message: cause instanceof Error ? cause.message : "No se pudo cargar el tablero de compras.", requestId: null }; }
function monthQuery(month: string): DesktopPurchasingDashboardQuery { const [year, monthNumber] = month.split("-").map(Number) as [number, number]; return { from: `${month}-01`, to: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10) }; }
function formatMoney(value: string, currency: string, rate: string | null) { const amount = currency === "VES" ? Number(value) : rate && Number(rate) > 0 ? Number(value) / Number(rate) : Number(value); return new Intl.NumberFormat("es-VE", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount); }
function currencyName(code: string) { return new Intl.DisplayNames(["es-VE"], { type: "currency" }).of(code) ?? code; }
function formatRate(value: string) { return new Intl.NumberFormat("es-VE", { maximumFractionDigits: 6 }).format(Number(value)); }
function shortDate(value: string) { return new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function documentLabel(value: string) { return value === "credit_note" ? "Nota de crédito" : value === "debit_note" ? "Nota de débito" : "Factura"; }
function originalTotal(document: { readonly transactionAmounts: { readonly total: { readonly amount: string; readonly currency: string } | null } }): string { const total = document.transactionAmounts.total; return total ? `${new Intl.NumberFormat("es-VE", { style: "currency", currency: total.currency, maximumFractionDigits: 2 }).format(Number(total.amount))} original · ` : ""; }
