import type {
    ContextFieldKind,
    OperationConfig,
    OperationKind,
} from "./operation-types";

// Helper: evaluate which context fields are required and surface a friendly error
// for the first one that's missing/empty. Used by all three configs below.
function makeContextValidator(
    requiredKinds: Array<{ kind: ContextFieldKind; label: string }>,
): (context: Record<ContextFieldKind, string>) => string | null {
    return (context) => {
        for (const { kind, label } of requiredKinds) {
            if (!context[kind]?.trim()) return `${label} es obligatorio`;
        }
        return null;
    };
}

const ADJUSTMENT_CONFIG: OperationConfig = {
    kind: "adjustment",
    labels: {
        pageTitle: "Nuevo Ajuste de Inventario",
        pageSubtitle: "Corrección de existencias por diferencia de inventario",
        sectionTitle: "Datos del ajuste",
        submitButton: "Registrar ajuste",
        submittingButton: "Registrando…",
        successTitle: "Ajuste registrado",
        successMessage: "Las existencias han sido actualizadas exitosamente.",
        primaryListLabel: "Ver ajustes",
        primaryListPath: "/inventory/adjustments",
        directionToggleLabel: "Tipo de ajuste *",
        rowBalanceLabel: "Existencia",
        rowBalanceAfterLabel: "Tras ajuste",
    },
    directionOptions: [
        {
            value: "ajuste_positivo",
            label: "Ajuste positivo (+)",
            isOutbound: false,
            defaultReference: "Ajuste positivo",
            description: "Aumenta las existencias — inventario físico mayor al sistema.",
        },
        {
            value: "ajuste_negativo",
            label: "Ajuste negativo (−)",
            isOutbound: true,
            defaultReference: "Ajuste negativo",
            description: "Reduce las existencias — inventario físico menor al sistema.",
            footerNote:
                "Los ajustes corrigen diferencias entre el inventario físico y el sistema. Deben estar respaldados por un acta o conteo físico.",
        },
    ],
    fixedDirection: null,
    contextFields: [
        {
            kind: "motivo",
            label: "Motivo del ajuste *",
            placeholder: "Ej: Conteo físico, merma, daño, corrección de error…",
            required: true,
            fullWidth: true,
        },
    ],
    enableLineAdjustments: true,
    buildMovementMeta: ({ directionDefaultReference, context }) => ({
        reference: directionDefaultReference,
        notes: context.motivo ?? "",
    }),
    validateContext: makeContextValidator([
        { kind: "motivo", label: "El motivo del ajuste" },
    ]),
};

const RETURN_CONFIG: OperationConfig = {
    kind: "return",
    labels: {
        pageTitle: "Nueva Devolución",
        pageSubtitle: "Registro de devolución a proveedor o de cliente",
        sectionTitle: "Datos de la devolución",
        submitButton: "Registrar devolución",
        submittingButton: "Registrando…",
        successTitle: "Devolución registrada",
        successMessage: "Las existencias han sido actualizadas exitosamente.",
        primaryListLabel: "Ver devoluciones",
        primaryListPath: "/inventory/returns",
        directionToggleLabel: "Tipo de devolución *",
        rowBalanceLabel: "Existencia",
        rowBalanceAfterLabel: "Tras devol.",
    },
    directionOptions: [
        {
            value: "devolucion_entrada",
            label: "Devol. a proveedor",
            isOutbound: true,
            defaultReference: "Devolución a proveedor",
            description: "Mercancía que regresa al proveedor — reduce las existencias.",
            footerNote:
                "Devolución a proveedor: reduce las existencias. Asegúrate de tener la nota de crédito o guía de devolución correspondiente.",
        },
        {
            value: "devolucion_salida",
            label: "Devol. de cliente",
            isOutbound: false,
            defaultReference: "Devolución de cliente",
            description: "Mercancía que regresa de un cliente — aumenta las existencias.",
            footerNote:
                "Devolución de cliente: aumenta las existencias. Registra la nota de crédito emitida al cliente.",
        },
    ],
    fixedDirection: null,
    contextFields: [
        {
            kind: "referencia",
            label: "Referencia del documento original",
            placeholder: "Nro. factura, guía de despacho…",
            required: false,
        },
        {
            kind: "notas",
            label: "Notas",
            placeholder: "Motivo, observaciones…",
            required: false,
        },
    ],
    enableLineAdjustments: false,
    buildMovementMeta: ({ directionDefaultReference, context }) => ({
        reference: context.referencia?.trim() || directionDefaultReference,
        notes: context.notas ?? "",
    }),
    validateContext: () => null,
};

const SELF_CONSUMPTION_CONFIG: OperationConfig = {
    kind: "self-consumption",
    labels: {
        pageTitle: "Nuevo Autoconsumo",
        pageSubtitle: "Retiro de inventario para uso interno de la empresa",
        sectionTitle: "Datos del autoconsumo",
        submitButton: "Registrar autoconsumo",
        submittingButton: "Registrando…",
        successTitle: "Autoconsumo registrado",
        successMessage: "Las existencias han sido actualizadas exitosamente.",
        primaryListLabel: "Ver autoconsumos",
        primaryListPath: "/inventory/self-consumption",
        rowBalanceLabel: "Existencia",
        rowBalanceAfterLabel: "Tras retiro",
    },
    directionOptions: null,
    fixedDirection: {
        value: "autoconsumo",
        isOutbound: true,
        defaultReference: "Autoconsumo",
        description: "Retira mercancía del inventario para uso interno — reduce las existencias.",
        footerNote:
            "El autoconsumo retira mercancía del inventario para uso interno. Según el Art. 4 de la LIVA, puede constituir un hecho imponible si los bienes generan crédito fiscal.",
    },
    contextFields: [
        {
            kind: "destino",
            label: "Destino / Uso *",
            placeholder: "Ej: Administración, Producción, Mantenimiento, Obsequio…",
            required: true,
            fullWidth: true,
        },
        {
            kind: "notas",
            label: "Notas adicionales",
            placeholder: "Observaciones, referencia interna…",
            required: false,
            fullWidth: true,
        },
    ],
    enableLineAdjustments: false,
    buildMovementMeta: ({ directionDefaultReference, context }) => {
        const destino = context.destino?.trim() ?? "";
        const notas = context.notas?.trim() ?? "";
        return {
            reference: directionDefaultReference,
            notes: destino + (notas ? ` — ${notas}` : ""),
        };
    },
    validateContext: makeContextValidator([
        { kind: "destino", label: "El destino del autoconsumo" },
    ]),
};

const CONFIGS: Record<OperationKind, OperationConfig> = {
    adjustment: ADJUSTMENT_CONFIG,
    return: RETURN_CONFIG,
    "self-consumption": SELF_CONSUMPTION_CONFIG,
};

export function getOperationConfig(kind: OperationKind): OperationConfig {
    return CONFIGS[kind];
}
