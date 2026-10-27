import { Toaster } from "sonner";
import { PresentFeedback } from "@kontave/client-feedback/application";
import { SonnerFeedbackPresenter } from "@kontave/client-feedback/sonner";

export const sonnerFeedbackPresenter = new SonnerFeedbackPresenter({ copyText: copyWithBrowserClipboard });
export const presentFeedback = new PresentFeedback(sonnerFeedbackPresenter);

function copyWithBrowserClipboard(value: string): void | Promise<void> {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) return;
  return navigator.clipboard.writeText(value);
}

/**
 * Renders the shared Desktop feedback viewport.
 * @returns The Sonner notification viewport.
 */
export function ToastViewport() {
  return <Toaster
    position="bottom-right"
    visibleToasts={4}
    toastOptions={{
      classNames: {
        toast: "kt-toast",
        title: "kt-toast__title",
        description: "kt-toast__description",
        error: "kt-toast--error",
        success: "kt-toast--success",
        warning: "kt-toast--warning",
        info: "kt-toast--info",
        loading: "kt-toast--info",
      },
    }}
  />;
}
