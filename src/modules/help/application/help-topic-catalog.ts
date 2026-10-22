import type { HelpTopicDefinition } from "@kontave/preferences/application";

/** Capability-owned Web help copy that users may personalize in their own account.
 * Operational answers remain canonical and are never part of this override catalog.
 */
export const WEB_HELP_TOPIC_CATALOG: readonly HelpTopicDefinition[] = Object.freeze([
  { id: "help.topic.payroll.intro", defaultText: "Cálculo quincenal, deducciones IVSS / FAOV / INCES, prestaciones, vacaciones y liquidaciones bajo LOTTT.", customizable: true },
  { id: "help.topic.inventory.intro", defaultText: "Catálogo de productos, kardex valorado, movimientos de entrada y salida, transformaciones y cierres de período.", customizable: true },
  { id: "help.topic.purchases.intro", defaultText: "Facturas de compra, retenciones de IVA e ISLR, proveedores y archivo cronológico.", customizable: true },
  { id: "help.topic.sales.intro", defaultText: "Facturación con IVA e IGTF, clientes, archivo del mes y reporte quincenal IGTF para el portal SENIAT.", customizable: true },
  { id: "help.topic.accounting.intro", defaultText: "Libro diario, plan de cuentas, balance de comprobación, estados financieros y períodos contables.", customizable: true },
  { id: "help.topic.config.intro", defaultText: "Empresas, miembros del equipo, suscripción, apariencia, instalación como app y datos de tu cuenta.", customizable: true },
  { id: "help.topic.documents.intro", defaultText: "Organiza archivos por empresa y carpeta, consulta documentos cargados y genera contratos desde plantillas disponibles.", customizable: true },
  { id: "help.topic.tools.intro", defaultText: "Consulta tasas oficiales del BCV, fechas del calendario tributario SENIAT y disponibilidad de portales oficiales.", customizable: true },
]);
