import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Política de Privacidad | Kontave",
    description:
        "Cómo Kontave recolecta, usa y protege los datos contables, de nómina e inventario que cargas en la plataforma. Cumplimiento de la LOPDP venezolana, encargados, retención y derechos del titular.",
    alternates: { canonical: "/legal/privacidad" },
    robots: { index: true, follow: true },
    openGraph: {
        type: "article",
        locale: "es_VE",
        url: "https://kontave.com/legal/privacidad",
        title: "Política de Privacidad · Kontave",
        description:
            "Cómo tratamos los datos personales y contables que cargas en Kontave: bases legales, encargados, retención y derechos del titular.",
        siteName: "Kontave",
    },
};

const VIGENTE_DESDE = "8 de mayo de 2026";
const VERSION       = "v1.0";

const SECTIONS: { id: string; n: string; title: string }[] = [
    { n: "01", id: "responsable",    title: "Responsable del tratamiento" },
    { n: "02", id: "alcance",        title: "Alcance de esta política" },
    { n: "03", id: "datos",          title: "Datos que recolectamos" },
    { n: "04", id: "finalidades",    title: "Finalidades del tratamiento" },
    { n: "05", id: "base-legal",     title: "Base legal y consentimiento" },
    { n: "06", id: "encargados",     title: "Encargados y sub-encargados" },
    { n: "07", id: "transferencias", title: "Transferencias internacionales" },
    { n: "08", id: "retencion",      title: "Conservación y eliminación" },
    { n: "09", id: "derechos",       title: "Tus derechos como titular" },
    { n: "10", id: "seguridad",      title: "Seguridad de la información" },
    { n: "11", id: "cookies",        title: "Cookies y tecnologías similares" },
    { n: "12", id: "menores",        title: "Menores de edad" },
    { n: "13", id: "cambios",        title: "Cambios a esta política" },
    { n: "14", id: "contacto",       title: "Contacto del oficial de datos" },
];

const TLDR: string[] = [
    "Tus RIF, empleados, asientos y facturas son tuyos. Kontave los procesa, nunca los vende.",
    "Cifrado en tránsito (TLS 1.3) y en reposo (AES-256); segregación lógica por tenant.",
    "Sólo compartimos datos con sub-encargados listados (Supabase, Vercel, BCV) y bajo contrato.",
    "Puedes pedir copia, corrección o eliminación escribiendo a datos@kontave.com en 15 días hábiles.",
    "Conservamos datos 90 días tras cancelar; los respaldos se purgan en los 90 días siguientes.",
    "Aplicamos la LOPDP venezolana; controversias en tribunales del Área Metropolitana de Caracas.",
];

export default function PrivacidadPage() {
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
                        Política de{" "}
                        <span className="whitespace-nowrap">
                            Privacidad<span className="text-primary-500">.</span>
                        </span>
                    </h1>

                    <p className="font-sans text-[17px] sm:text-[19px] text-text-tertiary leading-relaxed mt-6 max-w-2xl">
                        Trabajamos con datos sensibles: cédulas, salarios, RIF, asientos. Esta política explica qué guardamos, por qué, con quién lo compartimos y cómo puedes ejercer tus derechos. Sin letra chiquita.
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

                            <Section n="01" id="responsable" title="Responsable del tratamiento">
                                <P>
                                    El responsable del tratamiento de los datos personales que se procesan a través de Kontave es Kontave, C.A., sociedad mercantil con domicilio en Caracas, Venezuela. Para los fines de esta política, los términos «nosotros», «Kontave» y «la Plataforma» se usan indistintamente.
                                </P>
                                <Dl
                                    items={[
                                        ["Razón social",      "Kontave, C.A."],
                                        ["RIF",               "J-XXXXXXXX-X"],
                                        ["Domicilio",         "Caracas, Distrito Capital, Venezuela"],
                                        ["Oficial de datos",  <Mail key="d" to="datos@kontave.com">datos@kontave.com</Mail>],
                                    ]}
                                />
                            </Section>

                            <Section n="02" id="alcance" title="Alcance de esta política">
                                <P>
                                    Esta política aplica a todos los datos personales que recibimos cuando usas la Plataforma —ya sea como Contador titular de la Cuenta, miembro invitado, empleado de una Empresa cargada en Kontave o visitante del sitio web público kontave.com—.
                                </P>
                                <P>
                                    Para los términos comerciales y la relación contractual, complementa esta política con los{" "}
                                    <Link href="/legal/terminos" className="text-foreground underline decoration-primary-500/50 hover:decoration-primary-500 underline-offset-4">
                                        Términos y Condiciones
                                    </Link>.
                                </P>
                            </Section>

                            <Section n="03" id="datos" title="Datos que recolectamos">
                                <P>Recolectamos sólo lo necesario para prestar el Servicio. Las categorías son:</P>
                                <Dl
                                    items={[
                                        ["Identificación de la Cuenta", "Nombre, correo electrónico, contraseña cifrada (hash bcrypt), número de teléfono opcional, foto de perfil opcional."],
                                        ["Datos de la Empresa",         "RIF, razón social, domicilio fiscal, actividad económica, tipo de contribuyente (ordinario, especial, formal)."],
                                        ["Datos de empleados",          "Cédula, nombre, fecha de ingreso, cargo, salario en VES, estado (activo, vacación, inactivo), beneficiarios y datos del IVSS."],
                                        ["Datos contables",             "Asientos, plan de cuentas, balances, libros de IVA e ISLR, retenciones, comprobantes y archivos adjuntos que cargues."],
                                        ["Datos de inventario",         "Productos, costos, movimientos, facturas de compra, proveedores y transformaciones de producción."],
                                        ["Pagos y facturación",         "Últimos 4 dígitos del medio de pago, historial de cobros, divisa, IGTF aplicado. El número completo de la tarjeta lo gestiona la pasarela; nosotros no lo vemos."],
                                        ["Datos técnicos",              "Dirección IP, tipo de navegador, sistema operativo, fecha y hora de cada acción, registros de auditoría sobre operaciones sensibles."],
                                        ["Soporte",                     "Conversaciones, capturas de pantalla y archivos que envíes al equipo de soporte por correo, chat o ticket."],
                                    ]}
                                />
                                <P>
                                    No recolectamos categorías especiales de datos (origen racial, opiniones políticas, salud, religión, orientación sexual) salvo que tú decidas adjuntarlas dentro de un documento; en ese caso no las indexamos ni las procesamos automáticamente.
                                </P>
                            </Section>

                            <Section n="04" id="finalidades" title="Finalidades del tratamiento">
                                <P>Usamos los datos exclusivamente para:</P>
                                <Ul
                                    items={[
                                        "Prestar el Servicio: cálculos de nómina, asientos contables, kardex, reportes y exportaciones.",
                                        "Crear, autenticar y proteger tu Cuenta y los accesos delegados a tu equipo.",
                                        "Procesar pagos, emitir facturas y aplicar el IGTF cuando corresponda.",
                                        "Brindar soporte técnico y responder a solicitudes de los titulares de los datos.",
                                        "Cumplir obligaciones legales (tributarias, laborales, contables) que recaigan sobre Kontave o sus clientes.",
                                        "Mejorar el producto: detectar errores, medir uso agregado y priorizar funcionalidades. Los análisis se hacen sobre datos seudonimizados.",
                                        "Comunicarte cambios materiales del Servicio, alertas de seguridad y novedades. Puedes desuscribirte de las comunicaciones comerciales en cualquier momento.",
                                    ]}
                                />
                                <Callout>
                                    No usamos tus datos contables para entrenar modelos de inteligencia artificial generativa, propios ni de terceros, sin tu consentimiento expreso e individual.
                                </Callout>
                            </Section>

                            <Section n="05" id="base-legal" title="Base legal y consentimiento">
                                <P>
                                    Tratamos datos personales bajo las bases legales reconocidas por la Ley Orgánica de Protección de Datos Personales (LOPDP) venezolana y normas complementarias:
                                </P>
                                <Dl
                                    items={[
                                        ["Ejecución contractual", "Para crear y mantener tu Cuenta, calcular nóminas, generar reportes y todo lo necesario para entregar el Servicio que contrataste."],
                                        ["Cumplimiento legal",    "Para conservar comprobantes, atender requerimientos de SENIAT, IVSS, INCES y demás entes con facultad legal."],
                                        ["Interés legítimo",      "Para prevenir fraude, garantizar la seguridad de la Plataforma y mejorar la calidad del Servicio. Siempre evaluamos que tu derecho prevalezca."],
                                        ["Consentimiento",        "Para envío de comunicaciones comerciales no esenciales, cookies analíticas opcionales y cualquier tratamiento que la ley exija expresamente."],
                                    ]}
                                />
                                <P>
                                    Cuando el tratamiento se basa en tu consentimiento, puedes retirarlo en cualquier momento sin afectar la legalidad de los tratamientos ya realizados.
                                </P>
                            </Section>

                            <Section n="06" id="encargados" title="Encargados y sub-encargados">
                                <P>
                                    Para operar la Plataforma trabajamos con proveedores que actúan como encargados de tratamiento. Cada uno está vinculado por contrato y sólo procesa los datos por cuenta de Kontave para las finalidades previstas.
                                </P>
                                <Dl
                                    items={[
                                        ["Supabase (PostgreSQL + Auth)", "Base de datos primaria, autenticación y almacenamiento de archivos. Datos cifrados en reposo. Procesamiento en EE. UU."],
                                        ["Vercel",                       "Alojamiento del frontend, ejecución de funciones serverless y CDN. Procesamiento global con regiones primarias en EE. UU. y Europa."],
                                        ["Resend",                       "Envío de correos transaccionales (verificación, recuperación, alertas). No accede al contenido de la Cuenta."],
                                        ["Pasarela de pagos",            "Procesamiento de pagos en USD. Cumple PCI-DSS nivel 1. Recibe únicamente los datos necesarios para cobrar."],
                                        ["BCV (api-monitor-bcv)",        "Servicio público para consultar la tasa oficial USD/VES. Sólo consultamos: no enviamos datos personales."],
                                    ]}
                                />
                                <P>
                                    Si incorporamos un nuevo sub-encargado o cambiamos uno existente, actualizamos esta lista y notificamos por correo a los titulares de Cuenta con al menos 30 días de anticipación.
                                </P>
                            </Section>

                            <Section n="07" id="transferencias" title="Transferencias internacionales">
                                <P>
                                    Algunos de nuestros encargados están localizados fuera de Venezuela. Cuando transferimos datos al extranjero, lo hacemos amparados en cláusulas contractuales que exigen un nivel de protección equivalente al previsto por la LOPDP.
                                </P>
                                <P>
                                    Puedes solicitar copia del marco contractual aplicable a una transferencia específica escribiendo a <Mail to="datos@kontave.com">datos@kontave.com</Mail>.
                                </P>
                            </Section>

                            <Section n="08" id="retencion" title="Conservación y eliminación">
                                <P>
                                    Conservamos los datos sólo el tiempo necesario para cumplir las finalidades por las que fueron recolectados o el plazo que exija la ley.
                                </P>
                                <Dl
                                    items={[
                                        ["Datos de la Cuenta y Empresas", "Mientras la suscripción esté activa. Tras cancelación: 90 días corridos para permitir reactivación."],
                                        ["Comprobantes contables y nómina", "10 años, conforme al Código de Comercio y la LOTTT, salvo que la ley exija un plazo mayor."],
                                        ["Registros de pago y facturas",  "10 años, conforme a la normativa tributaria vigente."],
                                        ["Logs de auditoría",             "24 meses para investigaciones de seguridad."],
                                        ["Copias de respaldo",            "Las purgamos en los 90 días siguientes al borrado de los datos en producción."],
                                        ["Conversaciones de soporte",     "24 meses tras el cierre del ticket."],
                                    ]}
                                />
                                <P>
                                    Cuando un dato deja de ser necesario y no existe obligación legal de conservarlo, lo eliminamos o lo anonimizamos de forma irreversible.
                                </P>
                            </Section>

                            <Section n="09" id="derechos" title="Tus derechos como titular">
                                <P>
                                    La LOPDP te reconoce un conjunto de derechos sobre tus datos personales. Puedes ejercerlos sin costo escribiendo a <Mail to="datos@kontave.com">datos@kontave.com</Mail> desde el correo asociado a tu Cuenta. Te respondemos en máximo 15 días hábiles.
                                </P>
                                <Dl
                                    items={[
                                        ["Acceso",        "Saber qué datos tenemos sobre ti y obtener una copia legible."],
                                        ["Rectificación", "Corregir datos inexactos, incompletos o desactualizados."],
                                        ["Supresión",     "Pedir la eliminación cuando ya no sean necesarios o el tratamiento no tenga base legal."],
                                        ["Oposición",     "Oponerte a un tratamiento basado en interés legítimo, explicando la situación particular."],
                                        ["Portabilidad",  "Recibir tus datos en formato estructurado (CSV, JSON) o que los enviemos a otro proveedor."],
                                        ["Revocación",    "Retirar el consentimiento previamente otorgado, sin efectos retroactivos."],
                                        ["Reclamación",   "Acudir a la autoridad nacional competente en materia de protección de datos si consideras que tu derecho fue vulnerado."],
                                    ]}
                                />
                                <P>
                                    Si los datos pertenecen a un empleado o tercero cargado en una Empresa, generalmente la solicitud debe canalizarse a través del Contador titular o el representante legal de esa Empresa. Te ayudamos a identificar al responsable correcto.
                                </P>
                            </Section>

                            <Section n="10" id="seguridad" title="Seguridad de la información">
                                <P>
                                    Aplicamos medidas técnicas y organizativas razonables para proteger los datos contra acceso no autorizado, pérdida, alteración o divulgación.
                                </P>
                                <Ul
                                    items={[
                                        "Cifrado en tránsito con TLS 1.3 en todas las conexiones cliente-servidor.",
                                        "Cifrado en reposo con AES-256 en bases de datos y respaldos.",
                                        "Segregación lógica por tenant: cada Empresa vive en un esquema aislado y los RPC validan pertenencia antes de cualquier lectura o escritura.",
                                        "Autenticación con sesiones rotadas, hashing bcrypt para contraseñas y soporte para autenticación multifactor.",
                                        "Respaldos automáticos diarios con retención de 30 días y prueba periódica de restauración.",
                                        "Registro de auditoría inmutable sobre operaciones sensibles (cambio de plan, modificaciones de nómina, exportaciones masivas).",
                                        "Revisiones de seguridad y dependencias automáticas; gestión documentada de vulnerabilidades.",
                                    ]}
                                />
                                <P>
                                    Si detectas o sospechas un incidente de seguridad que afecte a tus datos, escríbenos a <Mail to="seguridad@kontave.com">seguridad@kontave.com</Mail>. En caso de brecha que afecte derechos, notificamos a los titulares y a la autoridad competente en los plazos que indique la ley.
                                </P>
                            </Section>

                            <Section n="11" id="cookies" title="Cookies y tecnologías similares">
                                <P>
                                    Usamos cookies y almacenamiento local del navegador para tres propósitos. Las cookies analíticas requieren tu consentimiento previo y puedes desactivarlas desde el banner o en Ajustes &gt; Privacidad.
                                </P>
                                <Dl
                                    items={[
                                        ["Esenciales",  "Mantienen tu sesión iniciada, recuerdan la Empresa seleccionada y protegen contra CSRF. No se pueden desactivar."],
                                        ["Preferencias", "Guardan tema (claro/oscuro), idioma y opciones del calculador. Se almacenan en localStorage."],
                                        ["Analíticas",  "Métricas agregadas y anónimas sobre uso y rendimiento. Se activan sólo con tu consentimiento."],
                                    ]}
                                />
                                <P>
                                    No usamos cookies publicitarias ni de seguimiento entre sitios.
                                </P>
                            </Section>

                            <Section n="12" id="menores" title="Menores de edad">
                                <P>
                                    Kontave es una herramienta profesional dirigida a contadores y empresas. No está diseñada para menores de 18 años y no recolectamos sus datos a sabiendas.
                                </P>
                                <P>
                                    Si descubrimos que se creó una Cuenta de un menor de edad sin autorización, la cerramos y eliminamos los datos asociados. Si crees que esto ocurrió, escríbenos a <Mail to="datos@kontave.com">datos@kontave.com</Mail>.
                                </P>
                            </Section>

                            <Section n="13" id="cambios" title="Cambios a esta política">
                                <P>
                                    Cuando actualicemos esta política, publicaremos la nueva versión en esta misma URL e indicaremos la fecha de vigencia. Si los cambios son materiales, te avisaremos por correo electrónico y por banner en la aplicación con al menos 30 días de anticipación.
                                </P>
                                <P>
                                    Si no estás de acuerdo con los cambios, puedes terminar la suscripción dentro de ese plazo y solicitar la eliminación de tus datos según lo previsto en la sección 09.
                                </P>
                            </Section>

                            <Section n="14" id="contacto" title="Contacto del oficial de datos">
                                <P>Para cualquier asunto relacionado con tus datos personales:</P>
                                <Dl
                                    items={[
                                        ["Oficial de datos",  <Mail key="d" to="datos@kontave.com">datos@kontave.com</Mail>],
                                        ["Seguridad",         <Mail key="g" to="seguridad@kontave.com">seguridad@kontave.com</Mail>],
                                        ["Asuntos legales",   <Mail key="l" to="legal@kontave.com">legal@kontave.com</Mail>],
                                        ["Soporte general",   <Mail key="s" to="hola@kontave.com">hola@kontave.com</Mail>],
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
                                    ¿Una duda sobre tus datos? Escríbenos a <Mail to="datos@kontave.com">datos@kontave.com</Mail>.
                                </p>
                            </div>
                            <Link
                                href="/legal/terminos"
                                className="inline-flex items-center h-10 px-5 rounded-full border border-border-default bg-surface-1 font-mono text-[12px] uppercase tracking-[0.14em] font-bold text-foreground hover:bg-surface-2 transition-colors shadow-sm"
                            >
                                Ver términos
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
