import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Términos y Condiciones | Kontave",
    description:
        "Condiciones de uso de Kontave: cuenta, planes y facturación, IGTF, datos del cliente, cumplimiento tributario y laboral en Venezuela, responsabilidad y jurisdicción.",
    alternates: { canonical: "/legal/terminos" },
    robots: { index: true, follow: true },
    openGraph: {
        type: "article",
        locale: "es_VE",
        url: "https://kontave.com/legal/terminos",
        title: "Términos y Condiciones · Kontave",
        description:
            "Condiciones de uso de la plataforma Kontave para contadores y empresas en Venezuela.",
        siteName: "Kontave",
    },
};

const VIGENTE_DESDE = "8 de mayo de 2026";
const VERSION       = "v1.0";

const SECTIONS: { id: string; n: string; title: string }[] = [
    { n: "01", id: "definiciones",    title: "Definiciones" },
    { n: "02", id: "aceptacion",      title: "Aceptación del contrato" },
    { n: "03", id: "cuenta",          title: "Cuenta y acceso" },
    { n: "04", id: "planes",          title: "Planes, facturación e IGTF" },
    { n: "05", id: "uso",             title: "Uso aceptable" },
    { n: "06", id: "datos",           title: "Datos del cliente y confidencialidad" },
    { n: "07", id: "propiedad",       title: "Propiedad intelectual" },
    { n: "08", id: "cumplimiento",    title: "Cumplimiento tributario y laboral" },
    { n: "09", id: "disponibilidad",  title: "Disponibilidad del servicio" },
    { n: "10", id: "terminacion",     title: "Suspensión y terminación" },
    { n: "11", id: "responsabilidad", title: "Limitación de responsabilidad" },
    { n: "12", id: "cambios",         title: "Modificaciones" },
    { n: "13", id: "ley",             title: "Ley aplicable y jurisdicción" },
    { n: "14", id: "contacto",        title: "Contacto" },
];

const TLDR: string[] = [
    "Tú eres dueño de los datos contables que cargas. Kontave los procesa, no los vende.",
    "Pagas en USD; la facturación local incluye IGTF cuando la operación queda gravada.",
    "Kontave es una herramienta: el responsable tributario y laboral sigue siendo tu cliente.",
    "Puedes cancelar cuando quieras y conservas el acceso hasta el fin del periodo pagado.",
    "Si la infraestructura cae más de lo prometido, te compensamos con días de servicio.",
    "Jurisdicción venezolana: tribunales del Área Metropolitana de Caracas, ley nacional.",
];

export default function TerminosPage() {
    return (
        <article className="relative">

            {/* ── Header band ─────────────────────────────────────────────── */}
            <header className="border-b border-border-light px-6 sm:px-10">
                <div className="max-w-7xl mx-auto pt-12 md:pt-20 pb-10 md:pb-14">
                    <div className="flex flex-wrap items-center gap-3 mb-7">
                        <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-surface-1 border border-border-default shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-text-secondary">
                                Legal · {VERSION}
                            </span>
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
                            Vigente desde {VIGENTE_DESDE}
                        </span>
                    </div>

                    <h1 className="font-sans text-[40px] sm:text-[56px] lg:text-[64px] font-black leading-[1.05] tracking-[-0.03em] text-foreground">
                        Términos y{" "}
                        <span className="whitespace-nowrap">
                            Condiciones<span className="text-primary-500">.</span>
                        </span>
                    </h1>

                    <p className="font-sans text-[17px] sm:text-[19px] text-text-tertiary leading-relaxed mt-6 max-w-2xl">
                        Estas son las reglas del juego entre tú y Kontave: qué obtienes con tu suscripción, qué hacemos con tus datos y qué pasa cuando algo sale mal. Sin letra chiquita.
                    </p>
                </div>
            </header>

            {/* ── TL;DR strip ─────────────────────────────────────────────── */}
            <section className="px-6 sm:px-10 border-b border-border-light bg-surface-1/40">
                <div className="max-w-7xl mx-auto py-10 md:py-14 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                    <div className="lg:col-span-3">
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-semibold">
                            Resumen
                        </span>
                        <h2 className="font-sans text-[22px] md:text-[26px] font-bold text-foreground leading-tight mt-2 tracking-[-0.01em]">
                            Lo esencial en seis líneas
                        </h2>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary mt-3 leading-relaxed">
                            No reemplaza el texto completo
                        </p>
                    </div>
                    <ul className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
                        {TLDR.map((line, i) => (
                            <li key={i} className="flex gap-3">
                                <span className="font-mono text-[11px] tabular-nums font-bold text-primary-500 pt-[3px] min-w-[22px]">
                                    0{i + 1}
                                </span>
                                <span className="font-sans text-[15px] md:text-[16px] text-text-secondary leading-[1.6]">
                                    {line}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* ── Body: TOC + content ─────────────────────────────────────── */}
            <div className="px-6 sm:px-10">
                <div className="max-w-7xl mx-auto py-12 md:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">

                    {/* TOC */}
                    <aside className="lg:col-span-3">
                        <div className="lg:sticky lg:top-24">
                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary font-semibold block mb-4">
                                Contenido
                            </span>
                            <nav aria-label="Tabla de contenidos">
                                <ol className="space-y-0.5">
                                    {SECTIONS.map((s) => (
                                        <li key={s.id}>
                                            <a
                                                href={`#${s.id}`}
                                                className="group flex items-baseline gap-3 py-2 -mx-2 px-2 rounded hover:bg-surface-2 transition-colors"
                                            >
                                                <span className="font-mono text-[10px] tabular-nums text-text-tertiary group-hover:text-primary-500 transition-colors">
                                                    {s.n}
                                                </span>
                                                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-secondary group-hover:text-foreground transition-colors leading-tight">
                                                    {s.title}
                                                </span>
                                            </a>
                                        </li>
                                    ))}
                                </ol>
                            </nav>
                        </div>
                    </aside>

                    {/* Content */}
                    <main className="lg:col-span-9">

                        <div className="space-y-16">

                            <Section n="01" id="definiciones" title="Definiciones">
                                <P>
                                    En estos Términos, las siguientes palabras tienen el significado que se indica. La definición aplica también cuando aparecen en plural o conjugadas en otros tiempos.
                                </P>
                                <Dl
                                    items={[
                                        ["Kontave", "Plataforma SaaS de contabilidad, nómina e inventario operada por Kontave, C.A., con domicilio en Caracas, Venezuela."],
                                        ["Servicio", "Acceso vía navegador a los módulos de Kontave y a las funciones, integraciones y herramientas que se ofrezcan bajo tu plan."],
                                        ["Cuenta", "Registro individual con correo electrónico que te identifica como usuario."],
                                        ["Empresa / Tenant", "Cada cliente final que cargas en Kontave (RIF más razón social). Una Cuenta puede administrar varias Empresas según el plan."],
                                        ["Contador", "Profesional de la contaduría pública que opera la Cuenta. En la mayoría de los casos, eres tú."],
                                        ["Datos del Cliente", "Toda la información (empleados, productos, asientos, facturas, documentos) que cargas o generas dentro del Servicio."],
                                    ]}
                                />
                            </Section>

                            <Section n="02" id="aceptacion" title="Aceptación del contrato">
                                <P>
                                    Al crear una Cuenta o usar el Servicio, declaras que leíste y aceptas estos Términos. Si los aceptas en nombre de una persona jurídica, declaras tener facultad para obligarla.
                                </P>
                                <P>
                                    Si no estás de acuerdo, no uses el Servicio. El uso continuado tras una modificación notificada implica aceptación de la versión vigente.
                                </P>
                            </Section>

                            <Section n="03" id="cuenta" title="Cuenta y acceso">
                                <P>
                                    Eres responsable de tus credenciales y de toda actividad realizada bajo tu Cuenta. Notifica a <Mail to="seguridad@kontave.com">seguridad@kontave.com</Mail> ante cualquier acceso no autorizado.
                                </P>
                                <P>
                                    Puedes invitar miembros adicionales (contadores asistentes, auxiliares) según los límites de tu plan. Cada miembro acepta estos Términos al recibir y aceptar la invitación.
                                </P>
                                <P>
                                    No debes compartir una misma Cuenta entre varias personas para evadir los límites del plan: cada usuario humano debe tener su acceso individual.
                                </P>
                            </Section>

                            <Section n="04" id="planes" title="Planes, facturación e IGTF">
                                <P>
                                    Los precios vigentes están publicados en{" "}
                                    <Link href="/#planes" className="text-foreground underline decoration-primary-500/50 hover:decoration-primary-500 underline-offset-4">
                                        /planes
                                    </Link>{" "}
                                    y se cobran en dólares de los Estados Unidos de América (USD) por adelantado, en ciclo mensual, trimestral o anual.
                                </P>
                                <P>
                                    Si la facturación se procesa en territorio venezolano y la operación queda gravada por el Impuesto a las Grandes Transacciones Financieras (IGTF), el monto correspondiente se traslada al usuario, calculado sobre el equivalente en bolívares a la tasa BCV del día del cobro.
                                </P>
                                <P>
                                    Las renovaciones son automáticas. Puedes desactivarlas desde Ajustes &gt; Facturación al menos 24 horas antes del próximo ciclo. Los pagos no son reembolsables salvo que estos Términos o la ley dispongan lo contrario.
                                </P>
                                <P>
                                    Si excedes el límite de empresas o empleados de tu plan, te ofrecemos subir de nivel. Mientras decides, podemos limitar la creación de registros nuevos sin afectar el acceso a los existentes.
                                </P>
                            </Section>

                            <Section n="05" id="uso" title="Uso aceptable">
                                <P>Te comprometes a no:</P>
                                <Ul
                                    items={[
                                        "Usar el Servicio para actividades ilícitas o que vulneren derechos de terceros.",
                                        "Cargar datos que no tengas autorización para procesar (clientes ajenos a tu cartera, por ejemplo).",
                                        "Realizar ingeniería inversa, descompilar el código o intentar extraer secretos del sistema.",
                                        "Sobrecargar la infraestructura con scraping masivo, scripts automatizados o ataques.",
                                        "Revender, sublicenciar o reempaquetar el Servicio sin autorización por escrito.",
                                    ]}
                                />
                            </Section>

                            <Section n="06" id="datos" title="Datos del cliente y confidencialidad">
                                <P>
                                    Los Datos del Cliente son y siguen siendo tuyos. Kontave actúa como encargado de su tratamiento, exclusivamente para prestar el Servicio, y no los cede ni los vende a terceros con fines comerciales.
                                </P>
                                <P>
                                    Aplicamos cifrado en tránsito (TLS 1.3) y en reposo (AES&#8209;256), respaldos diarios, segregación lógica por tenant y registros de auditoría sobre operaciones sensibles.
                                </P>
                                <P>
                                    El tratamiento se realiza conforme a los principios de la Ley Orgánica de Protección de Datos Personales venezolana y, cuando aplique, normativa equivalente del país desde el que accedas. Puedes solicitar exportación o eliminación de tus datos a <Mail to="datos@kontave.com">datos@kontave.com</Mail>; respondemos en un plazo máximo de 15 días hábiles.
                                </P>
                                <P>
                                    Si terminas tu suscripción, conservamos los Datos del Cliente durante 90 días corridos para permitir reactivación. Pasado ese plazo, los eliminamos de los sistemas de producción; las copias de respaldo se purgan en los 90 días siguientes.
                                </P>
                            </Section>

                            <Section n="07" id="propiedad" title="Propiedad intelectual">
                                <P>
                                    El software, la marca, los logos, la documentación y el diseño visual de Kontave son propiedad de Kontave, C.A. Te otorgamos una licencia limitada, no exclusiva, intransferible y revocable para usar el Servicio según tu plan.
                                </P>
                                <P>
                                    Cualquier sugerencia o feedback que nos envíes podrá ser incorporado al producto sin contraprestación, sin que ello implique cesión de los Datos del Cliente.
                                </P>
                            </Section>

                            <Section n="08" id="cumplimiento" title="Cumplimiento tributario y laboral">
                                <Callout>
                                    Kontave es una herramienta de cálculo y registro. La responsabilidad tributaria, laboral y contable de cada Empresa recae en su representante legal, en su contador externo o en quien firme las declaraciones.
                                </Callout>
                                <P>
                                    Los cálculos de nómina (LOTTT), retenciones (ISLR, IVA, IGTF), aportes parafiscales (IVSS, FAOV, INCES) y demás operaciones se realizan según las tasas y reglas vigentes en la fecha del cálculo. Cuando la regulación cambia, actualizamos las fórmulas en una versión nueva del Servicio; los cálculos anteriores quedan como evidencia de la regla aplicada en su momento.
                                </P>
                                <P>
                                    Es responsabilidad del usuario revisar cada cálculo antes de confirmarlo y antes de presentarlo ante SENIAT, IVSS u otros entes. Kontave no firma declaraciones ni representa al contribuyente.
                                </P>
                            </Section>

                            <Section n="09" id="disponibilidad" title="Disponibilidad del servicio">
                                <P>
                                    Nos comprometemos a una disponibilidad mensual del 99,5% en los planes Contable y Empresarial. La medición excluye ventanas de mantenimiento programado anunciadas con 48 horas de anticipación y eventos de fuerza mayor.
                                </P>
                                <P>
                                    Si en un mes calendario no alcanzamos ese umbral, otorgamos crédito proporcional al tiempo de indisponibilidad sobre el ciclo siguiente, previa solicitud a <Mail to="soporte@kontave.com">soporte@kontave.com</Mail>.
                                </P>
                            </Section>

                            <Section n="10" id="terminacion" title="Suspensión y terminación">
                                <P>
                                    Podemos suspender o terminar tu Cuenta si: (a) incumples estos Términos; (b) usas el Servicio para actividades ilícitas; (c) tu pago queda impago por más de 15 días corridos; o (d) un tercero con autoridad legal lo ordena.
                                </P>
                                <P>
                                    Tú puedes cancelar en cualquier momento desde Ajustes. Conservas acceso hasta el final del periodo ya pagado.
                                </P>
                                <P>
                                    Antes de cualquier terminación por nuestra parte, intentaremos notificarte y darte la oportunidad de exportar tus datos.
                                </P>
                            </Section>

                            <Section n="11" id="responsabilidad" title="Limitación de responsabilidad">
                                <P>
                                    El Servicio se ofrece «tal cual» y «según disponibilidad». En la medida permitida por la ley, Kontave no responde por daños indirectos, lucro cesante, pérdida de datos derivada de causas ajenas a nuestra infraestructura, ni por sanciones que recaigan sobre el contribuyente por errores en los datos cargados.
                                </P>
                                <P>
                                    La responsabilidad total acumulada de Kontave durante un periodo de doce meses no excederá lo efectivamente pagado por el usuario en esos doce meses.
                                </P>
                                <P>
                                    Esta limitación no aplica a daños causados por dolo o culpa grave debidamente comprobada.
                                </P>
                            </Section>

                            <Section n="12" id="cambios" title="Modificaciones del servicio y de estos términos">
                                <P>
                                    El Servicio evoluciona: agregamos funciones, ajustamos cálculos cuando cambia la ley y, ocasionalmente, retiramos componentes que dejaron de ser útiles.
                                </P>
                                <P>
                                    Los cambios materiales a estos Términos se notifican con al menos 30 días de anticipación por correo electrónico y en el banner de la aplicación. Si no estás de acuerdo, puedes terminar la suscripción dentro de ese plazo.
                                </P>
                            </Section>

                            <Section n="13" id="ley" title="Ley aplicable y jurisdicción">
                                <P>
                                    Estos Términos se rigen por las leyes de la República Bolivariana de Venezuela. Cualquier controversia que no pueda resolverse de buena fe se someterá a los tribunales del Área Metropolitana de Caracas, con renuncia expresa a cualquier otro fuero.
                                </P>
                            </Section>

                            <Section n="14" id="contacto" title="Contacto">
                                <P>Si algo de lo aquí descrito no es claro o quieres ejercer un derecho, escríbenos:</P>
                                <Dl
                                    items={[
                                        ["Soporte general",  <Mail key="s" to="hola@kontave.com">hola@kontave.com</Mail>],
                                        ["Asuntos legales",  <Mail key="l" to="legal@kontave.com">legal@kontave.com</Mail>],
                                        ["Datos personales", <Mail key="d" to="datos@kontave.com">datos@kontave.com</Mail>],
                                        ["Seguridad",        <Mail key="g" to="seguridad@kontave.com">seguridad@kontave.com</Mail>],
                                    ]}
                                />
                                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-tertiary leading-relaxed pt-2">
                                    Kontave, C.A. · RIF J&#8209;XXXXXXXX&#8209;X · Caracas, Venezuela.
                                </p>
                            </Section>
                        </div>

                        {/* Closing strip */}
                        <div className="mt-20 pt-10 border-t border-border-light flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
                                    Versión {VERSION} · vigente desde {VIGENTE_DESDE}
                                </p>
                                <p className="font-sans text-[14px] text-text-secondary mt-1">
                                    ¿Algo no cuadra? Escríbenos a <Mail to="legal@kontave.com">legal@kontave.com</Mail>.
                                </p>
                            </div>
                            <Link
                                href="/"
                                className="inline-flex items-center h-10 px-5 rounded-full border border-border-default bg-surface-1 font-mono text-[12px] uppercase tracking-[0.14em] font-bold text-foreground hover:bg-surface-2 transition-colors shadow-sm"
                            >
                                Volver al inicio
                            </Link>
                        </div>
                    </main>
                </div>
            </div>
        </article>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Section primitives
// ────────────────────────────────────────────────────────────────────────────

function Section({
    n,
    id,
    title,
    children,
}: {
    n:        string;
    id:       string;
    title:    string;
    children: ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-24">
            <header className="flex items-baseline gap-4 mb-6">
                <span className="font-mono text-[12px] tabular-nums font-bold text-primary-500 tracking-[0.06em]">
                    {n}
                </span>
                <h2 className="font-sans text-[24px] md:text-[28px] font-bold text-foreground leading-[1.15] tracking-[-0.01em]">
                    {title}
                </h2>
            </header>
            <div className="space-y-4 max-w-[68ch]">{children}</div>
        </section>
    );
}

function P({ children, className = "" }: { children: ReactNode; className?: string }) {
    return (
        <p className={`font-sans text-[16px] md:text-[17px] text-text-secondary leading-[1.7] ${className}`}>
            {children}
        </p>
    );
}

function Ul({ items }: { items: ReactNode[] }) {
    return (
        <ul className="space-y-2.5 max-w-[68ch]">
            {items.map((it, i) => (
                <li key={i} className="flex gap-4 font-sans text-[16px] md:text-[17px] text-text-secondary leading-[1.7]">
                    <span className="font-mono text-[11px] tabular-nums font-bold text-primary-500 pt-[7px] min-w-[28px]">
                        {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{it}</span>
                </li>
            ))}
        </ul>
    );
}

function Dl({ items }: { items: [string, ReactNode][] }) {
    return (
        <dl className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-6 border-t border-border-light pt-4 max-w-[68ch]">
            {items.map(([k, v], i) => {
                const last = i === items.length - 1;
                return (
                    <div key={i} className="contents">
                        <dt className={`font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary font-semibold pt-3 ${last ? "" : "border-b border-border-light/60"}`}>
                            {k}
                        </dt>
                        <dd className={`font-sans text-[15px] md:text-[16px] text-text-secondary leading-[1.65] py-3 ${last ? "" : "border-b border-border-light/60"}`}>
                            {v}
                        </dd>
                    </div>
                );
            })}
        </dl>
    );
}

function Mail({ to, children }: { to: string; children: ReactNode }) {
    return (
        <a
            href={`mailto:${to}`}
            className="text-foreground underline decoration-primary-500/50 hover:decoration-primary-500 underline-offset-4 transition-colors"
        >
            {children}
        </a>
    );
}

function Callout({ children }: { children: ReactNode }) {
    return (
        <div className="my-2 px-5 py-4 rounded-xl bg-primary-500/[0.06] border border-primary-500/25">
            <p className="font-sans text-[15px] md:text-[16px] text-foreground leading-[1.6] font-medium">
                {children}
            </p>
        </div>
    );
}
