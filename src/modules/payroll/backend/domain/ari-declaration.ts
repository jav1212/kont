// src/modules/payroll/backend/domain/ari-declaration.ts
//
// Dominio de la declaración AR-I (retención de ISLR sobre sueldos y salarios).
// La Forma AR-I del SENIAT estima el enriquecimiento trimestral del trabajador y
// determina el PORCENTAJE inicial de retención (casilla J). Ese porcentaje se
// guarda en employees.porcentaje_islr y alimenta el XML/PDF mensual de
// Retenciones ISLR.
//
// `computeAri` es una función PURA (sin dependencias de infraestructura) que
// reproduce las secciones A–J del formulario. Se importa tanto desde el frontend
// (preview en vivo) como desde el caso de uso de guardado (recálculo de
// integridad antes de persistir). Todos los montos intermedios están en
// Unidades Tributarias (U.T.).

// ── Constantes legales (Ley de ISLR / Decreto 1808 — Tarifa Nº 1) ─────────────

/** Desgravamen único trimestral prorrateado (Art. 60 Ley ISLR), en U.T. */
export const ARI_DESGRAVAMEN_UNICO_UT = 774 / 4;
/** Rebaja personal trimestral prorrateada (Art. 61 Ley ISLR), en U.T. */
export const ARI_REBAJA_PERSONAL_UT = 10 / 4;
/** Rebaja trimestral prorrateada por cada carga familiar (Art. 61 Ley ISLR), en U.T. */
export const ARI_REBAJA_CARGA_UT = 10 / 4;
/**
 * Umbral (U.T.) a partir del cual el trabajador está sujeto a retención. Se
 * evalúa sobre la REMUNERACIÓN BRUTA trimestral estimada (casilla B), no sobre el
 * enriquecimiento neto F. (Validado con normativa: gate sobre B.)
 */
export const ARI_UMBRAL_SUJETO_UT = 1000 / 4;

/**
 * Tarifa Nº 1 del ISLR para personas naturales residentes.
 * Cada tramo es `[límite superior en U.T., alícuota, sustraendo en U.T.]`.
 * El impuesto de un enriquecimiento F (en U.T.) es `F × alícuota − sustraendo`
 * usando el primer tramo cuyo límite superior sea ≥ F.
 */
export const ARI_TARIFA: ReadonlyArray<readonly [number, number, number]> = [
    [1000,      0.06,   0],
    [1500,      0.09,  30],
    [2000,      0.12,  75],
    [2500,      0.16, 155],
    [3000,      0.20, 255],
    [4000,      0.24, 375],
    [6000,      0.29, 575],
    [Infinity,  0.34, 875],
];

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** Entradas manuales del formulario AR-I (por empleado, año y trimestre gravable). */
export interface AriDeclarationInput {
    anioGravable:            number;
    trimestreGravable:       1 | 2 | 3 | 4;
    valorUT:                 number;   // valor de la U.T. en Bs
    remuneracionTrimestral:  number;   // casilla A (Bs), total manual
    usarDesgravamenUnico:    boolean;  // true → 193,5 U.T.; false → detallados
    desgEducacion:           number;   // Bs
    desgSeguros:             number;   // Bs (primas HCM)
    desgMedicos:             number;   // Bs
    desgIntereses:           number;   // Bs (vivienda / alquiler)
    cargasFamiliares:        number;
    impuestosRetenidosDeMas: number;   // Bs (rebaja por años anteriores)
}

/** Declaración AR-I persistida: entradas + identidad + porcentaje resultante. */
export interface AriDeclaration extends AriDeclarationInput {
    id?:                  string;
    companyId:            string;
    employeeId:           string;
    employeeCedula:       string;
    porcentajeRetencion:  number;      // casilla J (%)
    updatedAt?:           string;
}

/** Resultado del cálculo AR-I con todos los subtotales (secciones A–J). */
export interface AriResult {
    remuneracionUT:        number;   // B
    totalDesgravamenesBs:  number;   // C
    desgravamenesUT:       number;   // D
    desgravamenUnicoUT:    number;   // E
    enriquecimientoNetoUT: number;   // F
    alicuota:              number;   // tramo aplicado
    sustraendo:            number;   // tramo aplicado (U.T.)
    impuestoUT:            number;   // G
    rebajasUT:             number;   // H
    impuestoARetenerUT:    number;   // I
    porcentaje:            number;   // J (%)
    sujetoARetencion:      boolean;  // remuneración bruta trimestral (B) > 250 U.T.
    motivoPorcentajeCero:  "no_sujeto_umbral" | "sin_enriquecimiento_gravable" | "rebajas_agotan_impuesto" | null;
}

// ── Cálculo ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Devuelve `[alícuota, sustraendo]` del tramo de la Tarifa Nº 1 para F (en U.T.). */
function tramoTarifa(enriquecimientoUT: number): { alicuota: number; sustraendo: number } {
    const row = ARI_TARIFA.find(([limite]) => enriquecimientoUT <= limite) ?? ARI_TARIFA[ARI_TARIFA.length - 1];
    return { alicuota: row[1], sustraendo: row[2] };
}

/**
 * Reproduce las secciones A–J de la Forma AR-I y devuelve el porcentaje inicial
 * de retención (casilla J). Robusto ante valorUT = 0 (devuelve 0, sin dividir).
 */
export function computeAri(input: AriDeclarationInput): AriResult {
    const valorUT = input.valorUT > 0 ? input.valorUT : 0;

    // B — remuneración estimada en U.T.
    const remuneracionUT = valorUT > 0 ? input.remuneracionTrimestral / valorUT : 0;
    const sujetoARetencion = remuneracionUT > ARI_UMBRAL_SUJETO_UT;

    // C / D / E — desgravámenes
    const totalDesgravamenesBs = input.usarDesgravamenUnico
        ? 0
        : input.desgEducacion + input.desgSeguros + input.desgMedicos + input.desgIntereses;
    const desgravamenesUT    = valorUT > 0 ? totalDesgravamenesBs / valorUT : 0;
    const desgravamenUnicoUT = totalDesgravamenesBs > 0 ? 0 : ARI_DESGRAVAMEN_UNICO_UT;
    const deduccionUT        = desgravamenesUT > 0 ? desgravamenesUT : desgravamenUnicoUT;

    // F — enriquecimiento neto gravable en U.T.
    const enriquecimientoNetoCalculadoUT = remuneracionUT - deduccionUT;
    // La base gravable no puede ser negativa. Si los desgravamenes superan la
    // remuneracion, la diferencia solo explica por que no hay retencion.
    const enriquecimientoNetoUT = Math.max(0, enriquecimientoNetoCalculadoUT);

    // G — impuesto del trimestre gravable según la Tarifa Nº 1
    const { alicuota, sustraendo } = tramoTarifa(Math.max(0, enriquecimientoNetoUT));
    const impuestoUT = sujetoARetencion && enriquecimientoNetoUT > 0
        ? enriquecimientoNetoUT * alicuota - sustraendo
        : 0;

    // H — rebajas (personal + cargas + impuestos retenidos de más)
    const cargas = Math.max(0, Math.trunc(input.cargasFamiliares));
    const rebajasUT =
        ARI_REBAJA_PERSONAL_UT +
        ARI_REBAJA_CARGA_UT * cargas +
        (valorUT > 0 ? input.impuestosRetenidosDeMas / valorUT : 0);

    // I — impuesto (estimado) a retener en el trimestre
    const impuestoARetenerUT = !sujetoARetencion || impuestoUT < rebajasUT ? 0 : impuestoUT - rebajasUT;

    // J — porcentaje inicial de retención
    const porcentaje = sujetoARetencion && remuneracionUT > 0
        ? round2((impuestoARetenerUT / remuneracionUT) * 100)
        : 0;

    const motivoPorcentajeCero =
        !sujetoARetencion && remuneracionUT > 0
            ? "no_sujeto_umbral"
            : enriquecimientoNetoCalculadoUT <= 0
                ? "sin_enriquecimiento_gravable"
                : impuestoARetenerUT <= 0 && impuestoUT > 0
                    ? "rebajas_agotan_impuesto"
                    : null;

    return {
        remuneracionUT:        round2(remuneracionUT),
        totalDesgravamenesBs:  round2(totalDesgravamenesBs),
        desgravamenesUT:       round2(desgravamenesUT),
        desgravamenUnicoUT,
        enriquecimientoNetoUT: round2(enriquecimientoNetoUT),
        alicuota,
        sustraendo,
        impuestoUT:            round2(impuestoUT),
        rebajasUT:             round2(rebajasUT),
        impuestoARetenerUT:    round2(impuestoARetenerUT),
        porcentaje,
        sujetoARetencion,
        motivoPorcentajeCero,
    };
}
