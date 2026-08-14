import { Toaster, toast } from "sonner";
import {
  PresentFeedback,
  type ClientFeedback,
  type FeedbackHandle,
  type FeedbackPresenter,
} from "@kontave/client-feedback-application";

type CopyText = (value: string) => void | Promise<void>;

export class SonnerFeedbackPresenter implements FeedbackPresenter {
  private readonly sonnerIds = new Map<FeedbackHandle, string | number>();

  constructor(private readonly copyText: CopyText = copyWithBrowserClipboard) {}

  present(feedback: ClientFeedback): FeedbackHandle {
    const referenceCode = feedback.referenceCode;
    const options = {
      ...(feedback.description === null ? {} : { description: feedback.description }),
      ...(feedback.deduplicationKey === null ? {} : { id: feedback.deduplicationKey }),
      ...(referenceCode === null ? {} : { action: {
        label: "Copiar código",
        onClick: () => { void this.copyText(referenceCode); },
      } }),
    };
    const sonnerId = feedback.intent === "error" ? toast.error(feedback.message, options)
      : feedback.intent === "success" ? toast.success(feedback.message, options)
      : feedback.intent === "warning" ? toast.warning(feedback.message, options)
      : toast.info(feedback.message, options);
    const handle = `sonner:${String(sonnerId)}`;
    this.sonnerIds.set(handle, sonnerId);
    return handle;
  }

  dismiss(handle: FeedbackHandle): void {
    toast.dismiss(this.sonnerIds.get(handle) ?? handle);
    this.sonnerIds.delete(handle);
  }
}

export const sonnerFeedbackPresenter = new SonnerFeedbackPresenter();
export const presentFeedback = new PresentFeedback(sonnerFeedbackPresenter);

function copyWithBrowserClipboard(value: string): void | Promise<void> {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) return;
  return navigator.clipboard.writeText(value);
}

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
      },
    }}
  />;
}
