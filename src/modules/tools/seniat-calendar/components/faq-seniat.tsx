"use client";

import { BaseAccordion, accordionItemProps } from "@/src/shared/frontend/components/base-accordion";

const FAQ_ITEMS = [
    {
        key: "faq-1",
        title: "¿Quiénes están obligados a declarar IVA mensualmente?",
        answer:
            "Los contribuyentes ordinarios del Impuesto al Valor Agregado (personas jurídicas y naturales que realizan actividades económicas habituales) deben declarar y pagar el IVA mensualmente, dentro de los primeros 15 días hábiles del mes siguiente al período de imposición. Los sujetos pasivos especiales tienen un cronograma diferenciado según el último dígito de su RIF.",
    },
    {
        key: "faq-2",
        title: "¿Qué es un Sujeto Pasivo Especial y cómo sé si soy uno?",
        answer:
            "Los Sujetos Pasivos Especiales son contribuyentes designados expresamente por el SENIAT mediante una providencia administrativa, generalmente empresas con ingresos brutos anuales superiores a cierto umbral o que el SENIAT considera de alto impacto recaudatorio. Puedes verificar tu condición en el portal del SENIAT (www.seniat.gob.ve) o a través de la notificación oficial que el SENIAT debió haberle enviado a tu empresa.",
    },
    {
        key: "faq-3",
        title: "¿Qué es la retención de ISLR a terceros?",
        answer:
            "Las retenciones de ISLR son montos que ciertos contribuyentes (principalmente los sujetos pasivos especiales actuando como agentes de retención) deben descontar de los pagos que realizan a sus proveedores y enterarlos al SENIAT. Esto aplica a pagos por bienes, servicios, arrendamientos y otras remuneraciones según los porcentajes establecidos en la providencia correspondiente.",
    },
    {
        key: "faq-4",
        title: "¿El IGTF aplica a todas las empresas?",
        answer:
            "El Impuesto a las Grandes Transacciones Financieras (IGTF) aplica principalmente a los Sujetos Pasivos Especiales (persona jurídica) que realicen pagos mediante divisas o criptomonedas distintas al bolívar, o que utilicen sistemas de pago en moneda extranjera. La tasa general es del 3%. Se declara y paga mensualmente según el cronograma SENIAT.",
    },
    {
        key: "faq-5",
        title: "¿Dónde presento mis declaraciones tributarias?",
        answer:
            "Las declaraciones tributarias se presentan en línea a través del Portal SENIAT (www.seniat.gob.ve), específicamente en el sistema SIVIT (Sistema Integrado de Ventas Ilícitas y Tributación) o DECLARAISLR para el impuesto sobre la renta. Los pagos se realizan a través de los bancos autorizados o mediante la banca en línea usando los datos del formulario generado por el sistema SENIAT.",
    },
];

export function FaqSeniat() {
    return (
        <section className="mt-10 pt-8 border-t border-border-light flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
                    Preguntas frecuentes
                </span>
                <h2 className="text-[20px] sm:text-[22px] font-mono font-bold tracking-[-0.01em] text-text-primary leading-tight">
                    Sobre el Calendario Tributario SENIAT
                </h2>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface-1 p-2">
                <BaseAccordion.Root selectionMode="single">
                    {FAQ_ITEMS.map((item) => (
                        <BaseAccordion.Item
                            key={item.key}
                            {...accordionItemProps({ title: item.title })}
                        >
                            <p className="text-[13px] text-text-secondary leading-relaxed font-mono">
                                {item.answer}
                            </p>
                        </BaseAccordion.Item>
                    ))}
                </BaseAccordion.Root>
            </div>
        </section>
    );
}
