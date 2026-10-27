// notify.ts — single entry point for user-facing notifications on the Web.
//
// Usage:
//   notify.success("Recibo exportado a PDF.");
//   notify.warning("Sin permisos para editar; modo lectura.");
//   notify.info("Se aplicó el tipo de cambio del BCV.");
//   notify.error("Indica una etiqueta y una clave estable.");        // expected failure, no incident
//   notify.failure(error, "No se pudo guardar el empleado.");          // any caught error: classified
//   notify.promise(saveEmployee(), {
//       loading: "Guardando…",
//       success: "Empleado guardado.",
//       error:   "No se pudo guardar el empleado.",
//   });
//
// Rules (ADR 0025):
//   - error    → failures the user can understand or correct (validation, permissions, business rules).
//                It never creates an incident. Pass `errorCode` only when the API returned one.
//   - failure  → inside `catch`. The Web classifier decides: expected failures show their own message,
//                API incidents (5xx + KNT code) show the existing reference, and anything else is
//                reported once and shows the fallback message with a new reference.
//   - success  → confirmations of actions (guardar, eliminar, exportar).
//   - warning  → boundary states (datos parciales, permisos reducidos).
//   - info     → neutral changes that need no action.
//   - Errors are never rendered in divs/JSX; always via `notify.*`.
//   - Real-time field validation (onChange) does NOT toast — the input's `isInvalid` border is enough.
//
// Implementation: facade over @kontave/client-feedback composed in ./feedback/web-feedback.ts.
// The Toaster is mounted once in app/layout.tsx so this works from anywhere.

import {
    clientFeedback,
    errorFeedback,
    infoFeedback,
    reportedFailureFeedback,
    successFeedback,
    warningFeedback,
    type ClientFeedback,
    type FeedbackAction,
    type FeedbackHandle,
} from "@kontave/client-feedback/application";
import { isIncidentCode } from "@kontave/observability/contracts";
import { resolveWebFailure, webFeedback } from "@/src/shared/frontend/feedback/web-feedback";

export interface NotifyAction {
    label:   string;
    onClick: () => void;
}

export interface NotifyOpts {
    description?: string;
    /** Exact visible time in milliseconds, e.g. an undo window. Omit to use the viewport default. */
    duration?:    number;
    /** @deprecated Use `deduplicationKey`; kept as an alias for existing callers. */
    id?:          string | number;
    /** Stable key that replaces an existing notification for the same recurring situation. */
    deduplicationKey?: string;
    /** `errorCode` returned by the API envelope. A `KNT-…` value is an incident the server already recorded. */
    errorCode?:   string;
    /** Optional follow-up rendered next to the notification (e.g. "Deshacer", "Reintentar"). */
    action?:      NotifyAction;
}

export interface NotifyFailureOpts {
    /** Stable lowercase event name used to group incidents, e.g. "payroll.confirm.failed". */
    eventName?: string;
    deduplicationKey?: string;
    /** Non-sensitive diagnostic context stored with the incident when the failure is unexpected. */
    attributes?: Record<string, unknown>;
    /** Always show `fallbackMessage`, even when an expected failure carries its own presentable message. */
    useFallbackMessage?: boolean;
    action?: NotifyAction;
}

const DEFAULT_FAILURE_EVENT = "web.unexpected_failure";
const GENERIC_MESSAGE = "Ocurrió un error inesperado.";

// The portable contract rejects empty or oversized copy. Callers pass server
// messages verbatim, so the facade normalizes them instead of throwing from a
// UI handler.
function text(value: string | null | undefined, maximum: number): string | null {
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized ? normalized.slice(0, maximum) : null;
}

function messageOf(value: string | null | undefined, fallback = GENERIC_MESSAGE): string {
    return text(value, 1_000) ?? fallback;
}

function toAction(action: NotifyAction | undefined): FeedbackAction | null {
    if (!action) return null;
    return { label: text(action.label, 60) ?? "Acción", perform: action.onClick };
}

function deduplicationKeyOf(opts: { deduplicationKey?: string; id?: string | number } | undefined): string | null {
    return text(opts?.deduplicationKey ?? (opts?.id === undefined ? undefined : String(opts.id)), 200);
}

function commonOptions(opts: NotifyOpts | undefined) {
    const duration = opts?.duration;
    return {
        description: text(opts?.description, 2_000),
        deduplicationKey: deduplicationKeyOf(opts),
        autoDismissMs: duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : null,
        action: toAction(opts?.action),
    };
}

function present(feedback: ClientFeedback): FeedbackHandle {
    try {
        return webFeedback.execute(feedback);
    } catch (error) {
        console.error("[notify] feedback could not be presented", error);
        return "";
    }
}

function isAbort(error: unknown): boolean {
    return typeof error === "object" && error !== null && "name" in error && (error as { name: unknown }).name === "AbortError";
}

function failureFeedback(error: unknown, fallbackMessage: string, opts: NotifyFailureOpts | undefined): Promise<ClientFeedback> {
    const publicMessage = messageOf(fallbackMessage);
    const deduplicationKey = deduplicationKeyOf(opts);
    return resolveWebFailure.execute({
        eventName: opts?.eventName ?? DEFAULT_FAILURE_EVENT,
        error,
        publicMessage,
        attributes: opts?.attributes,
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
    }).then(({ feedback }) => clientFeedback({
        ...feedback,
        message: opts?.useFallbackMessage ? publicMessage : feedback.message,
        deduplicationKey: deduplicationKey ?? feedback.deduplicationKey,
        action: toAction(opts?.action) ?? feedback.action,
    }), () => errorFeedback(publicMessage, { deduplicationKey }));
}

export const notify = {
    error: (message: string, opts?: NotifyOpts): FeedbackHandle => {
        const errorCode = text(opts?.errorCode, 128);
        try {
            if (errorCode && isIncidentCode(errorCode)) {
                const reported = reportedFailureFeedback({ message: messageOf(message), referenceCode: errorCode, deduplicationKey: deduplicationKeyOf(opts) });
                return present(clientFeedback({ ...reported, description: text(opts?.description, 2_000), action: toAction(opts?.action) }));
            }
            return present(errorFeedback(messageOf(message), { ...commonOptions(opts), referenceCode: errorCode }));
        } catch (error) {
            console.error("[notify] invalid error feedback", error);
            return "";
        }
    },

    /**
     * Presents any caught failure according to the Web classification policy.
     * Never throws and never rejects; AbortError is ignored because the caller cancelled on purpose.
     */
    failure: (error: unknown, fallbackMessage: string, opts?: NotifyFailureOpts): void => {
        if (isAbort(error)) return;
        void failureFeedback(error, fallbackMessage, opts).then(present).catch(() => undefined);
    },

    success: (message: string, opts?: NotifyOpts): FeedbackHandle => present(successFeedback(messageOf(message, "Listo."), commonOptions(opts))),
    warning: (message: string, opts?: NotifyOpts): FeedbackHandle => present(warningFeedback(messageOf(message, "Atención."), commonOptions(opts))),
    info:    (message: string, opts?: NotifyOpts): FeedbackHandle => present(infoFeedback(messageOf(message, "Aviso."), commonOptions(opts))),

    /** Shows progress for `p`, then its outcome. Returns `p` unchanged so callers keep their own handling. */
    promise: <T>(
        p: Promise<T>,
        msgs: {
            loading: string;
            success: string | ((value: T) => string);
            error:   string | ((err:   unknown) => string);
        },
    ): Promise<T> => {
        void webFeedback.track(p, {
            loading: messageOf(msgs.loading, "Procesando…"),
            success: (value) => messageOf(typeof msgs.success === "function" ? msgs.success(value) : msgs.success, "Listo."),
            failure: (cause) => failureFeedback(cause, typeof msgs.error === "function" ? msgs.error(cause) : msgs.error, undefined),
        }).catch(() => undefined);
        return p;
    },

    dismiss: (handle: FeedbackHandle): void => {
        if (handle) webFeedback.dismiss(handle);
    },
} as const;
