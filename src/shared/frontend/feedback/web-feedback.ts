// Web composition root for portable client feedback (ADR 0025).
// The Toaster viewport is mounted once in app/layout.tsx; everything here is
// module-level so hooks, handlers, and error boundaries share one presenter,
// one incident reporter, and one deduplication/budget state per page.

import { PresentFeedback, ResolveFailure, ResolveUnexpectedFailure } from "@kontave/client-feedback/application";
import { SonnerFeedbackPresenter } from "@kontave/client-feedback/sonner";
import { WebFailureClassifier } from "./web-failure-classifier";
import { WebIncidentReporter } from "./web-incident-reporter";

const presenter = new SonnerFeedbackPresenter({ copyText: copyToClipboard });

export const webFeedback = new PresentFeedback(presenter);
export const resolveUnexpectedWebFailure = new ResolveUnexpectedFailure(new WebIncidentReporter());
export const resolveWebFailure = new ResolveFailure(new WebFailureClassifier(), resolveUnexpectedWebFailure);

function copyToClipboard(value: string): void | Promise<void> {
    if (typeof navigator === "undefined" || navigator.clipboard === undefined) return;
    return navigator.clipboard.writeText(value);
}
