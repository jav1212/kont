"use client";

// Centro de Ayuda — destino del shortcut "Ayuda" del sidebar (`/help`).
//
// Tres bandas verticales, sin hero ni grid de tiles:
//   1. PageHeader con un solo CTA secundario ("Estado de portales").
//   2. Banda 60/40: filtro de búsqueda + panel de soporte directo.
//   3. Lista editorial de seis temas; cada tema es un acordeón de FAQs.
//
// El filtro recorta las preguntas en vivo (sin debounce, dataset chico).
// Si una sección queda sin matches se atenúa pero no desaparece —
// preservar la estructura es más útil que esconder bloques.

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
    Search,
    X,
    MessageCircle,
    Mail,
    Clock,
    ArrowUpRight,
    Activity,
    Wallet,
    Package,
    ShoppingCart,
    Receipt,
    BookOpen,
    Settings2,
} from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import {
    BaseAccordion,
    accordionItemProps,
} from "@/src/shared/frontend/components/base-accordion";

// ── Datos estáticos ──────────────────────────────────────────────────────────
//
// El contenido es voz de contadora venezolana: terso, lower-case, técnico.
// Se evita el "?" doble del español invertido en preguntas frecuentes para
// que la lectura tabular del accordion no se sienta cargada — convención
// del producto, no descuido.

interface Faq {
    id: string;
    q: string;
    a: string;
}

interface Topic {
    id: string;
    label: string;
    intro: string;
    icon: ReactNode;
    faqs: Faq[];
}

const TOPICS: Topic[] = [
    {
        id: "payroll",
        label: "Nómina",
        icon: <Wallet size={18} strokeWidth={2} />,
        intro:
            "Cálculo quincenal, deducciones IVSS / FAOV / INCES, prestaciones, vacaciones y liquidaciones bajo LOTTT.",
        faqs: [
            {
                id: "p1",
                q: "Cómo recalculo el salario integral de un empleado",
                a: "El cálculo se ejecuta en /payroll/liquidations al abrir el caso. El motor toma los recibos de los últimos 12 meses, suma alícuotas de utilidades y bono vacacional, y entrega el salario integral diario. No hay un botón de \"recalcular\" — abre la liquidación y lo verás recalculado automáticamente con los recibos disponibles.",
            },
            {
                id: "p2",
                q: "Por qué un empleado en estado \"vacación\" no aparece en la quincena",
                a: "Solo los empleados con estado activo generan recibo en la quincena. El estado vacación los excluye del corrido normal; el monto correspondiente se calcula desde /payroll/vacations y se paga por separado.",
            },
            {
                id: "p3",
                q: "La tasa BCV se aplica al salario en bolívares",
                a: "No. El salario mensual queda en VES tal como se registró. Solo las filas de bono en USD se convierten a bolívares usando la tasa BCV cargada para la fecha del recibo. Si dejas vacía la tasa, los bonos en USD no se calculan.",
            },
            {
                id: "p4",
                q: "Cómo registro un bono extraordinario en USD",
                a: "En el calculador de quincena agrega una fila de bono indicando el monto en dólares; el sistema lo convierte a bolívares con la tasa BCV del día y lo suma al neto. Si necesitas dejarlo en VES directamente, usa una fila de ingreso en lugar de bono.",
            },
            {
                id: "p5",
                q: "Qué alícuota de IVSS aplica a un contribuyente especial",
                a: "La alícuota IVSS es independiente del régimen de contribuyente: 4% empleado y entre 9% y 11% patronal según el grupo de riesgo de la empresa. La condición de contribuyente especial sí cambia las retenciones de IVA en compras y ventas, no las cotizaciones laborales.",
            },
        ],
    },
    {
        id: "inventory",
        label: "Inventario",
        icon: <Package size={18} strokeWidth={2} />,
        intro:
            "Catálogo de productos, kardex valorado, movimientos de entrada y salida, transformaciones y cierres de período.",
        faqs: [
            {
                id: "i1",
                q: "Qué método de valuación elijo: PEPS o promedio ponderado",
                a: "Cada producto se configura individualmente. El default es promedio ponderado, que es el más común en empresas medianas y simplifica el cierre. PEPS conviene cuando trabajas con productos perecederos o lotes con costos muy variables. UEPS / LIFO no es fiscalmente aceptado por SENIAT en Venezuela; el sistema no lo ofrece como opción.",
            },
            {
                id: "i2",
                q: "Cómo registro una devolución de venta",
                a: "Desde /inventory/movements crea un movimiento tipo \"devolución de venta\" indicando producto y cantidad. El sistema regresa la cantidad al saldo y reincorpora el costo unitario al kardex usando el último costo de salida del producto.",
            },
            {
                id: "i3",
                q: "Por qué no veo la entrada de mi factura de compra en el kardex",
                a: "Mientras la factura esté en estado pendiente (registrada pero no confirmada) el movimiento no impacta saldos. Abre la factura en /purchases/[id] y confírmala; al confirmarse se generan los movimientos de entrada y aparecen en /inventory/movements y en el kardex.",
            },
            {
                id: "i4",
                q: "Qué ocurre cuando cierro un período",
                a: "El saldo final del mes pasa a ser saldo inicial del siguiente y los movimientos del período cerrado quedan bloqueados para edición. Si necesitas corregir un movimiento posterior al cierre, primero reabre el período desde /inventory/closings.",
            },
        ],
    },
    {
        id: "purchases",
        label: "Compras",
        icon: <ShoppingCart size={18} strokeWidth={2} />,
        intro:
            "Facturas de compra, retenciones de IVA e ISLR, proveedores y archivo cronológico.",
        faqs: [
            {
                id: "c1",
                q: "Cómo aplico el 75% de retención de IVA al proveedor",
                a: "Marca al proveedor como contribuyente especial en /purchases/suppliers. A partir de allí, las facturas de ese proveedor se cargan con 75% de retención por defecto. La retención sube a 100% en casos específicos: factura sin RIF, RIF no inscrito en el portal SENIAT, o servicios profesionales sin comprobante. El sistema te lo advierte al confirmar.",
            },
            {
                id: "c2",
                q: "La factura genera asiento contable automáticamente",
                a: "Sí, al confirmarla. El asiento incluye gasto o inventario, IVA crédito fiscal, retención de IVA por pagar, ISLR retenido por pagar y la cuenta por pagar al proveedor. Puedes verlo en /accounting/journal con la referencia al número de control de la factura.",
            },
            {
                id: "c3",
                q: "Puedo importar facturas de compra en lote",
                a: "No por ahora. Cada factura se registra una a la vez para preservar la trazabilidad por número de control SENIAT y la conciliación con el libro de compras. Si manejas un volumen alto, /purchases/new/quick acelera la captura mínima.",
            },
        ],
    },
    {
        id: "sales",
        label: "Ventas",
        icon: <Receipt size={18} strokeWidth={2} />,
        intro:
            "Facturación con IVA e IGTF, clientes, archivo del mes y reporte quincenal IGTF para el portal SENIAT.",
        faqs: [
            {
                id: "s1",
                q: "Cuándo aplico IGTF del 3%",
                a: "Solo cuando la venta se cobra en divisas (USD, EUR) o criptoactivos. Pagos recibidos en bolívares por transferencia, punto de venta o efectivo no causan IGTF. El sistema lo activa automáticamente al elegir la moneda de cobro.",
            },
            {
                id: "s2",
                q: "Cómo cuadro el reporte quincenal de IGTF",
                a: "Abre /sales/igtf-fortnightly, selecciona la quincena, revisa el resumen de operaciones gravadas y exporta el TXT. Súbelo al portal SENIAT antes del día 17 (primera quincena) o del último día hábil del mes (segunda quincena).",
            },
            {
                id: "s3",
                q: "Puedo emitir nota de crédito",
                a: "En este release no hay un flujo dedicado de nota de crédito. Para reversar una venta registra un movimiento de devolución desde /inventory/movements y, si afecta IVA, ajusta el libro de ventas con un asiento manual en /accounting/journal/new. El flujo formal de nota de crédito está en backlog.",
            },
        ],
    },
    {
        id: "accounting",
        label: "Contabilidad",
        icon: <BookOpen size={18} strokeWidth={2} />,
        intro:
            "Libro diario, plan de cuentas, balance de comprobación, estados financieros y períodos contables.",
        faqs: [
            {
                id: "a1",
                q: "Por qué dos asientos muestran el mismo número correlativo",
                a: "No debería ocurrir. El correlativo es generado por la base de datos al confirmar el asiento. Si lo ves duplicado, abre /accounting/journal, copia los dos IDs internos y escríbenos por WhatsApp para investigar. Mientras tanto evita confirmar nuevos asientos en el período afectado.",
            },
            {
                id: "a2",
                q: "El plan de cuentas es editable",
                a: "Sí, en /accounting/charts. La estructura inicial sigue el formato venezolano de cinco dígitos por nivel y se puede ampliar. Puedes desactivar cuentas en cualquier momento, pero solo se eliminan las que no tienen movimientos asociados — el sistema lo bloquea para preservar la trazabilidad.",
            },
            {
                id: "a3",
                q: "Cómo cierro el ejercicio fiscal",
                a: "Desde /accounting/periods marca el año como cerrado tras cuadrar el resultado del ejercicio y trasladar saldos a patrimonio. La acción es reversible mientras nadie haya generado la declaración ISLR del siguiente período. Antes de cerrar, descarga los estados financieros desde /accounting/financial-statements como respaldo.",
            },
        ],
    },
    {
        id: "config",
        label: "Configuración",
        icon: <Settings2 size={18} strokeWidth={2} />,
        intro:
            "Empresas, miembros del equipo, suscripción, apariencia, instalación como app y datos de tu cuenta.",
        faqs: [
            {
                id: "g1",
                q: "Cuántas empresas puedo administrar",
                a: "Depende del plan contratado. El plan inicial cubre hasta 5 empresas; los planes superiores escalan a 15 y 30. Revisa el límite vigente y los add-ons en /settings/billing.",
            },
            {
                id: "g2",
                q: "Cómo invito a un colega con acceso a empresas específicas",
                a: "En /settings/members agrega el correo del colega y elige las empresas que podrá ver. El invitado recibe un link por correo; cuando acepta, su sesión solo carga las empresas autorizadas. Puedes revocar el acceso en cualquier momento desde la misma pantalla.",
            },
            {
                id: "g3",
                q: "El RIF cambia las fechas de vencimiento SENIAT",
                a: "Sí. El último dígito del RIF determina el día de vencimiento de IVA, retenciones y declaración estimada. Al seleccionar la empresa en el selector superior, /tools/calendario-seniat actualiza las fechas automáticamente sin que tengas que configurar nada.",
            },
            {
                id: "g4",
                q: "Cómo cambio entre tema oscuro y claro",
                a: "En /settings/apariencia. Kontave soporta los dos temas con paletas separadas (no es un flip de colores) y mantiene contraste WCAG AA en ambos. El tema queda guardado por dispositivo.",
            },
        ],
    },
];

const TOTAL_FAQS = TOPICS.reduce((s, t) => s + t.faqs.length, 0);

const SUPPORT_WHATSAPP_DISPLAY = "+58 412 000 0000";
const SUPPORT_WHATSAPP_HREF = "https://wa.me/584120000000";
const SUPPORT_EMAIL = "soporte@kontave.com";

// ─────────────────────────────────────────────────────────────────────────────

export default function HelpPage() {
    const [query, setQuery] = useState("");
    const lc = query.trim().toLowerCase();

    const filtered = useMemo(() => {
        if (lc === "") return TOPICS;
        return TOPICS.map((t) => {
            const labelHit = t.label.toLowerCase().includes(lc);
            return {
                ...t,
                faqs: t.faqs.filter((f) => {
                    if (labelHit) return true;
                    return (
                        f.q.toLowerCase().includes(lc) ||
                        f.a.toLowerCase().includes(lc)
                    );
                }),
            };
        });
    }, [lc]);

    const totalMatches = filtered.reduce((s, t) => s + t.faqs.length, 0);
    const isFiltering = lc !== "";

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-surface-2">
            <PageHeader
                title="Centro de Ayuda"
                subtitle="Guías, atajos y soporte directo"
            >
                <Link
                    href="/tools/status"
                    className="group inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-primary-500/25 bg-primary-500/8 hover:bg-primary-500/14 hover:border-primary-500/40 text-[12px] font-mono uppercase tracking-[0.12em] text-primary-600 dark:text-primary-500 transition-colors"
                >
                    <Activity size={12} />
                    Estado de portales
                    <ArrowUpRight
                        size={12}
                        className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                </Link>
            </PageHeader>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[1280px] mx-auto w-full px-4 sm:px-6 md:px-8 py-6 md:py-8 flex flex-col gap-8">
                    {/* ── Banda superior: filtro + soporte ──────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                        <SearchPanel
                            query={query}
                            onQueryChange={setQuery}
                            totalMatches={totalMatches}
                            totalAll={TOTAL_FAQS}
                            isFiltering={isFiltering}
                        />
                        <SupportPanel />
                    </div>

                    {/* ── Lista editorial de temas ──────────────────────── */}
                    <div className="flex flex-col gap-8">
                        {filtered.map((topic) => {
                            const total = TOPICS.find((t) => t.id === topic.id)!.faqs.length;
                            const dimmed = isFiltering && topic.faqs.length === 0;
                            return (
                                <TopicSection
                                    key={topic.id}
                                    topic={topic}
                                    total={total}
                                    dimmed={dimmed}
                                />
                            );
                        })}
                    </div>

                    {/* ── Estado vacío global ───────────────────────────── */}
                    {isFiltering && totalMatches === 0 && (
                        <NoResults query={query} onClear={() => setQuery("")} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Panel de búsqueda ────────────────────────────────────────────────────────

interface SearchPanelProps {
    query: string;
    onQueryChange: (v: string) => void;
    totalMatches: number;
    totalAll: number;
    isFiltering: boolean;
}

function SearchPanel({
    query,
    onQueryChange,
    totalMatches,
    totalAll,
    isFiltering,
}: SearchPanelProps) {
    return (
        <section
            aria-labelledby="help-search-label"
            className="relative lg:col-span-3 rounded-xl border border-border-light bg-surface-1 shadow-sm shadow-black/[0.03] p-5 flex flex-col gap-3 overflow-hidden"
        >
            <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary-500/0 via-primary-500/70 to-primary-500/0"
            />

            <div className="flex items-center justify-between gap-3">
                <label
                    id="help-search-label"
                    htmlFor="help-search"
                    className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground"
                >
                    Buscar en la ayuda
                </label>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary-600 dark:text-primary-500 tabular-nums">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                    {totalAll} en total
                </span>
            </div>

            <div className="relative">
                <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-500 pointer-events-none"
                />
                <input
                    id="help-search"
                    type="search"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") onQueryChange("");
                    }}
                    placeholder="Busca por palabra clave, módulo o pregunta"
                    className="w-full bg-surface-1 border border-border-default rounded-lg pl-9 pr-9 h-10 font-mono text-[14px] text-foreground placeholder:text-foreground/40 outline-none transition-colors duration-150 hover:border-border-medium focus:border-primary-500 focus:bg-primary-500/[0.03]"
                    autoComplete="off"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => onQueryChange("")}
                        aria-label="Limpiar búsqueda"
                        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-6 w-6 rounded-md text-foreground/55 hover:text-primary-600 hover:bg-primary-500/10 transition-colors"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            <div className="flex items-center justify-between gap-3 min-h-[16px]">
                <span
                    className={[
                        "font-mono text-[11px] uppercase tracking-[0.14em] tabular-nums",
                        isFiltering
                            ? "text-primary-600 dark:text-primary-500 font-semibold"
                            : "text-foreground/55",
                    ].join(" ")}
                >
                    {isFiltering
                        ? `${totalMatches} ${totalMatches === 1 ? "resultado" : "resultados"}`
                        : "Filtra por módulo, palabra o pregunta"}
                </span>
                {isFiltering && (
                    <kbd className="font-mono text-[10px] uppercase tracking-[0.12em] text-foreground/55 border border-border-light rounded px-1.5 py-0.5 bg-surface-2/60">
                        Esc
                    </kbd>
                )}
            </div>
        </section>
    );
}

// ── Panel de soporte directo ─────────────────────────────────────────────────

function SupportPanel() {
    return (
        <section
            aria-labelledby="help-support-label"
            className="lg:col-span-2 rounded-xl border border-border-light bg-surface-1 shadow-sm shadow-black/[0.03] overflow-hidden flex flex-col"
        >
            <header className="px-5 py-4 border-b border-border-light flex items-center justify-between gap-3">
                <h2
                    id="help-support-label"
                    className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground"
                >
                    Soporte directo
                </h2>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300 bg-emerald-500/12 border border-emerald-500/25 rounded-full px-2 py-0.5">
                    <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                    />
                    En línea
                </span>
            </header>

            <SupportRow
                icon={<MessageCircle size={16} strokeWidth={2} />}
                label="WhatsApp"
                value={SUPPORT_WHATSAPP_DISPLAY}
                href={SUPPORT_WHATSAPP_HREF}
                external
                tabularNums
                tone="success"
            />
            <SupportRow
                icon={<Mail size={16} strokeWidth={2} />}
                label="Correo"
                value={SUPPORT_EMAIL}
                href={`mailto:${SUPPORT_EMAIL}`}
                tone="primary"
            />

            <div className="px-5 py-3 border-t border-border-light bg-surface-2/40 mt-auto">
                <div className="flex items-start gap-2 font-mono text-[11px] text-foreground/55 leading-snug">
                    <Clock size={12} className="mt-0.5 shrink-0" />
                    <span>
                        Lun – Vie · 8:00 a 17:00 (VET) · Respuesta en menos de 4 h hábiles
                    </span>
                </div>
            </div>
        </section>
    );
}

interface SupportRowProps {
    icon: ReactNode;
    label: string;
    value: string;
    href: string;
    external?: boolean;
    tabularNums?: boolean;
    /** "primary" → naranja Konta, "success" → verde semántico (WhatsApp). */
    tone?: "primary" | "success";
}

function SupportRow({
    icon,
    label,
    value,
    href,
    external,
    tabularNums,
    tone = "primary",
}: SupportRowProps) {
    const tile =
        tone === "success"
            ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
            : "bg-primary-500/10 border border-primary-500/25 text-primary-600 dark:text-primary-500";

    return (
        <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            className="group flex items-center gap-3 px-5 py-3 border-t border-border-light first:border-t-0 hover:bg-surface-2 transition-colors"
        >
            <span
                className={[
                    "inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0 transition-colors",
                    tile,
                ].join(" ")}
            >
                {icon}
            </span>
            <div className="flex-1 min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/55">
                    {label}
                </div>
                <div
                    className={[
                        "font-mono text-[14px] text-foreground truncate",
                        tabularNums ? "tabular-nums" : "",
                    ].join(" ")}
                >
                    {value}
                </div>
            </div>
            <ArrowUpRight
                size={14}
                className="text-foreground/40 group-hover:text-primary-500 transition-colors shrink-0"
            />
        </a>
    );
}

// ── Sección de tema con FAQs ─────────────────────────────────────────────────

interface TopicSectionProps {
    topic: Topic;
    total: number;
    dimmed: boolean;
}

function TopicSection({ topic, total, dimmed }: TopicSectionProps) {
    const matchedAll = topic.faqs.length === total;
    return (
        <section
            aria-labelledby={`help-topic-${topic.id}`}
            className={[
                "transition-opacity duration-150",
                dimmed ? "opacity-40" : "",
            ].join(" ")}
        >
            <header className="flex items-start gap-4 pb-3 border-b border-border-light mb-4">
                <span
                    aria-hidden
                    className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary-500/10 border border-primary-500/25 text-primary-600 dark:text-primary-500 shrink-0"
                >
                    {topic.icon}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <h2
                            id={`help-topic-${topic.id}`}
                            className="font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-foreground"
                        >
                            {topic.label}
                        </h2>
                        <span
                            className={[
                                "inline-flex items-center font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums px-1.5 py-0.5 rounded",
                                matchedAll
                                    ? "bg-primary-500/10 text-primary-600 dark:text-primary-500 border border-primary-500/20"
                                    : "bg-surface-2 text-foreground/55 border border-border-light",
                            ].join(" ")}
                        >
                            {topic.faqs.length} / {total}
                        </span>
                    </div>
                    <p className="font-sans text-[14px] text-foreground/65 leading-snug mt-1 max-w-[68ch]">
                        {topic.intro}
                    </p>
                </div>
            </header>

            {topic.faqs.length > 0 ? (
                <BaseAccordion.Root selectionMode="multiple">
                    {topic.faqs.map((f) => (
                        <BaseAccordion.Item
                            key={f.id}
                            {...accordionItemProps({ title: f.q })}
                        >
                            <p className="font-sans text-[14px] leading-relaxed text-foreground/80 max-w-[72ch]">
                                {f.a}
                            </p>
                        </BaseAccordion.Item>
                    ))}
                </BaseAccordion.Root>
            ) : (
                <p className="font-sans text-[13px] text-foreground/50 italic">
                    Sin preguntas que coincidan en este tema.
                </p>
            )}
        </section>
    );
}

// ── Estado vacío global (cero matches en todo el contenido) ──────────────────

interface NoResultsProps {
    query: string;
    onClear: () => void;
}

function NoResults({ query, onClear }: NoResultsProps) {
    return (
        <section
            role="status"
            className="rounded-xl border border-border-default bg-surface-1 shadow-sm shadow-black/[0.03] px-6 py-8 flex items-start gap-5"
        >
            <span
                aria-hidden
                className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary-500/10 border border-primary-500/25 text-primary-600 dark:text-primary-500 shrink-0"
            >
                <Search size={18} strokeWidth={2} />
            </span>
            <div className="flex-1 flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary-600 dark:text-primary-500 font-semibold">
                        Sin coincidencias
                    </span>
                    <p className="font-sans text-[15px] text-foreground/85 leading-snug max-w-[60ch]">
                        No encontramos respuesta para «{query}». Escríbenos y te respondemos
                        en menos de 4 horas hábiles.
                    </p>
                </div>
            <div className="flex flex-wrap items-center gap-2">
                <a
                    href={SUPPORT_WHATSAPP_HREF}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[12px] font-mono uppercase tracking-[0.12em] font-semibold transition-colors"
                >
                    <MessageCircle size={12} />
                    Escribir por WhatsApp
                </a>
                <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border-light bg-surface-1 hover:bg-surface-2 hover:border-border-medium text-[12px] font-mono uppercase tracking-[0.12em] text-foreground/70 hover:text-foreground transition-colors"
                >
                    <Mail size={12} />
                    Enviar correo
                </a>
                <button
                    type="button"
                    onClick={onClear}
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-lg text-[12px] font-mono uppercase tracking-[0.12em] text-foreground/55 hover:text-foreground transition-colors"
                >
                    <X size={12} />
                    Limpiar búsqueda
                </button>
                </div>
            </div>
        </section>
    );
}
