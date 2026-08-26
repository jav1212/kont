import type { RoundingMode } from "@kontave/monetary-domain";
import type { PayrollPolicyReference } from "@kontave/payroll-domain";
import { VenezuelanPayrollFailure } from "./failure";

export type VenezuelanObligationCode =
  | "VE_IVSS_EMPLOYEE"
  | "VE_IVSS_EMPLOYER"
  | "VE_RPE_EMPLOYEE"
  | "VE_RPE_EMPLOYER"
  | "VE_FAOV_EMPLOYEE"
  | "VE_FAOV_EMPLOYER"
  | "VE_INCES_EMPLOYER"
  | "VE_INCES_EMPLOYEE_YEAR_END"
  | "VE_ISLR_EMPLOYMENT_WITHHOLDING"
  | "VE_CESTATICKET_SOCIALISTA";

export type LegalAuthorityKind = "official_gazette" | "statute" | "regulation" | "official_communication" | "judicial_precedent" | "binding_judgment";
export interface VenezuelanLegalSource {
  readonly id: string;
  readonly title: string;
  readonly authorityKind: LegalAuthorityKind;
  readonly officialGazette: string;
  readonly publishedOn: string;
  readonly articles: readonly string[];
}

export interface VenezuelanStatutoryRule {
  readonly code: VenezuelanObligationCode;
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly assessmentPeriod: "contribution_week" | "calendar_month" | "calendar_quarter" | "tax_year" | "payment_event";
  readonly liableParty: "employee" | "employer";
  readonly collectingEntity: "IVSS" | "BANAVIH" | "INCES" | "SENIAT" | "WORKER";
  readonly roundingMode: RoundingMode;
  readonly sources: readonly VenezuelanLegalSource[];
}

const LOTSS: VenezuelanLegalSource = {
  id: "VE-LOTSS-2012",
  title: "Ley Orgánica del Sistema de Seguridad Social",
  authorityKind: "statute",
  officialGazette: "39.912",
  publishedOn: "2012-04-30",
  articles: ["113", "116", "132"],
};
const LSS: VenezuelanLegalSource = {
  id: "VE-LSS-2012",
  title: "Ley del Seguro Social y Reglamento General",
  authorityKind: "regulation",
  officialGazette: "39.912",
  publishedOn: "2012-04-30",
  articles: ["Ley 58, 66, 67", "Reglamento 83"],
};
const LRPE: VenezuelanLegalSource = {
  id: "VE-LRPE-2005",
  title: "Ley del Régimen Prestacional de Empleo",
  authorityKind: "statute",
  officialGazette: "38.281",
  publishedOn: "2005-09-27",
  articles: ["46", "47"],
};
const LRPH: VenezuelanLegalSource = {
  id: "VE-LRPH-2008",
  title: "Ley del Régimen Prestacional de Vivienda y Hábitat",
  authorityKind: "statute",
  officialGazette: "5.889 Extraordinario",
  publishedOn: "2008-07-31",
  articles: ["30"],
};
const INCES: VenezuelanLegalSource = {
  id: "VE-INCES-2014",
  title: "Decreto con Rango, Valor y Fuerza de Ley del INCES",
  authorityKind: "statute",
  officialGazette: "6.155 Extraordinario",
  publishedOn: "2014-11-19",
  articles: ["49", "50"],
};
const DECREE_1808: VenezuelanLegalSource = {
  id: "VE-ISLR-D1808-1997",
  title: "Reglamento Parcial de la Ley de ISLR en Materia de Retenciones",
  authorityKind: "regulation",
  officialGazette: "36.203",
  publishedOn: "1997-05-12",
  articles: ["1", "2", "4", "5", "6", "7"],
};
export const CESTATICKET_LAW_2015: VenezuelanLegalSource = {
  id: "VE-CESTATICKET-D2066-2015",
  title: "Decreto con Rango, Valor y Fuerza de Ley del Cestaticket Socialista para los Trabajadores y Trabajadoras",
  authorityKind: "statute",
  officialGazette: "40.773",
  publishedOn: "2015-10-23",
  articles: ["1", "2", "4", "5", "6", "7", "8", "18"],
};
export const CESTATICKET_DECREE_4805: VenezuelanLegalSource = {
  id: "VE-CESTATICKET-D4805-2023",
  title: "Decreto que establece el Aumento del Ingreso Mínimo Mensual para la Protección del Pueblo Venezolano",
  authorityKind: "regulation",
  officialGazette: "6.746 Extraordinario",
  publishedOn: "2023-05-01",
  articles: ["1", "5", "7"],
};
export const CESTATICKET_REGULATION_2013: VenezuelanLegalSource = {
  id: "VE-CESTATICKET-REGULATION-2013",
  title: "Reglamento de la Ley de Alimentación para los Trabajadores y las Trabajadoras",
  authorityKind: "regulation",
  officialGazette: "40.112",
  publishedOn: "2013-02-20",
  articles: ["17", "24", "29", "30", "34"],
};
export const CESTATICKET_EXECUTIVE_ADJUSTMENT_2023: VenezuelanLegalSource = {
  id: "VE-CESTATICKET-EXECUTIVE-ADJUSTMENT-2023",
  title: "Ajuste ejecutivo del Cestaticket a USD 40 indexados a la tasa oficial BCV",
  authorityKind: "official_communication",
  officialGazette: "not_published_as_usd_amount",
  publishedOn: "2023-05-01",
  articles: ["anuncio público del Ejecutivo Nacional"],
};
export const CESTATICKET_SCS_712_2024: VenezuelanLegalSource = {
  id: "VE-TSJ-SCS-712-2024",
  title: "Sentencia 712 de la Sala de Casación Social",
  authorityKind: "judicial_precedent",
  officialGazette: "not_applicable",
  publishedOn: "2024-12-19",
  articles: ["valor vigente del Cestaticket"],
};
export const CESTATICKET_SCS_371_2025: VenezuelanLegalSource = {
  id: "VE-TSJ-SCS-371-2025",
  title: "Sentencia 371 de la Sala de Casación Social",
  authorityKind: "judicial_precedent",
  officialGazette: "not_applicable",
  publishedOn: "2025-08-13",
  articles: ["valor vigente del Cestaticket"],
};
export const CESTATICKET_SCS_250_2026: VenezuelanLegalSource = {
  id: "VE-TSJ-SCS-250-2026",
  title: "Sentencia 250 de la Sala de Casación Social",
  authorityKind: "judicial_precedent",
  officialGazette: "not_applicable",
  publishedOn: "2026-06-01",
  articles: ["criterio reiterado sobre USD 40 mensuales"],
};
export const ECONOMIC_WAR_BONUS_DECREE_4805: VenezuelanLegalSource = {
  id: "VE-ECONOMIC-WAR-BONUS-D4805-2023",
  title: "Decreto que crea el Bono contra la Guerra Económica",
  authorityKind: "regulation",
  officialGazette: "6.746 Extraordinario",
  publishedOn: "2023-05-01",
  articles: ["2", "4", "5", "7"],
};
export const SOCIOECONOMIC_INCOME_ADJUSTMENT_2026: VenezuelanLegalSource = {
  id: "VE-SOCIOECONOMIC-INCOME-ADJUSTMENT-2026",
  title: "Ajuste ejecutivo del ingreso mínimo integral a USD 240",
  authorityKind: "official_communication",
  officialGazette: "not_published",
  publishedOn: "2026-04-30",
  articles: ["anuncio y aplicación administrativa desde mayo de 2026"],
};

export const VENEZUELAN_STATUTORY_RULES: readonly VenezuelanStatutoryRule[] = [
  rule("VE_IVSS_EMPLOYEE", "employee", "IVSS", "contribution_week", "2012-04-30", [LOTSS, LSS]),
  rule("VE_IVSS_EMPLOYER", "employer", "IVSS", "contribution_week", "2012-04-30", [LOTSS, LSS]),
  rule("VE_RPE_EMPLOYEE", "employee", "IVSS", "calendar_month", "2005-09-27", [LRPE]),
  rule("VE_RPE_EMPLOYER", "employer", "IVSS", "calendar_month", "2005-09-27", [LRPE]),
  rule("VE_FAOV_EMPLOYEE", "employee", "BANAVIH", "calendar_month", "2008-07-31", [LRPH]),
  rule("VE_FAOV_EMPLOYER", "employer", "BANAVIH", "calendar_month", "2008-07-31", [LRPH]),
  rule("VE_INCES_EMPLOYER", "employer", "INCES", "calendar_quarter", "2014-11-19", [INCES]),
  rule("VE_INCES_EMPLOYEE_YEAR_END", "employee", "INCES", "payment_event", "2014-11-19", [INCES]),
  rule("VE_ISLR_EMPLOYMENT_WITHHOLDING", "employee", "SENIAT", "payment_event", "1997-05-12", [DECREE_1808]),
  rule("VE_CESTATICKET_SOCIALISTA", "employer", "WORKER", "calendar_month", "2023-05-01", [
    CESTATICKET_LAW_2015,
    CESTATICKET_REGULATION_2013,
    CESTATICKET_DECREE_4805,
    CESTATICKET_EXECUTIVE_ADJUSTMENT_2023,
    CESTATICKET_SCS_712_2024,
    CESTATICKET_SCS_371_2025,
    CESTATICKET_SCS_250_2026,
  ]),
] as const;

export function resolveVenezuelanRule(code: VenezuelanObligationCode, date: string): VenezuelanStatutoryRule {
  const found = VENEZUELAN_STATUTORY_RULES.find((candidate) =>
    candidate.code === code && candidate.effectiveFrom <= date && (candidate.effectiveUntil === null || candidate.effectiveUntil >= date));
  if (!found) throw new VenezuelanPayrollFailure("VE_PAYROLL_RULE_NOT_EFFECTIVE", `No effective ${code} rule for ${date}.`);
  return found;
}

export function venezuelanPayrollPolicyReference(rule: VenezuelanStatutoryRule): PayrollPolicyReference {
  return { jurisdiction: "VE", code: rule.code, version: rule.version, effectiveFrom: rule.effectiveFrom };
}

function rule(
  code: VenezuelanObligationCode,
  liableParty: "employee" | "employer",
  collectingEntity: VenezuelanStatutoryRule["collectingEntity"],
  assessmentPeriod: VenezuelanStatutoryRule["assessmentPeriod"],
  effectiveFrom: string,
  sources: readonly VenezuelanLegalSource[],
): VenezuelanStatutoryRule {
  return { code, version: effectiveFrom, effectiveFrom, effectiveUntil: null, assessmentPeriod, liableParty, collectingEntity, roundingMode: "half_up", sources };
}
