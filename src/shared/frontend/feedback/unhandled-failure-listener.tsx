"use client";

import { useEffect } from "react";
import { WebFailureClassifier } from "./web-failure-classifier";
import { resolveUnexpectedWebFailure } from "./web-feedback";

// Browser noise that is not a Kontave failure: opaque cross-origin script
// errors and the benign ResizeObserver notification loop.
const IGNORED_MESSAGES = [/^Script error\.?$/i, /ResizeObserver loop/i];

const classifier = new WebFailureClassifier();

/**
 * Records uncaught errors and unhandled promise rejections as incidents without showing UI: the screen that
 * failed owns its own feedback, and a global toast for background failures would be noise.
 * Expected failures and errors raised by browser extensions are ignored.
 * @returns Nothing; the listener only installs window handlers.
 */
export function UnhandledFailureListener(): null {
    useEffect(() => {
        const record = (error: unknown, eventName: string, attributes?: Record<string, unknown>) => {
            if (classifier.classify(error) !== null) return;
            if (error instanceof Error && error.name === "AbortError") return;
            void resolveUnexpectedWebFailure.execute({
                eventName,
                error,
                publicMessage: "Ocurrió un error inesperado.",
                attributes,
            });
        };

        const onError = (event: ErrorEvent) => {
            if (IGNORED_MESSAGES.some((pattern) => pattern.test(event.message))) return;
            if (event.filename && !event.filename.startsWith(window.location.origin)) return;
            record(event.error ?? new Error(event.message), "web.unhandled.error", { line: event.lineno, column: event.colno });
        };
        const onRejection = (event: PromiseRejectionEvent) => record(event.reason, "web.unhandled.rejection");

        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onRejection);
        return () => {
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onRejection);
        };
    }, []);

    return null;
}
