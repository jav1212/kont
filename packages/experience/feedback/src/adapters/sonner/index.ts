import { toast } from "sonner";
import type { ClientFeedback, FeedbackHandle, FeedbackPresenter } from "../../application/index";

/** Copies a reference code using the platform clipboard; may resolve asynchronously. */
export type CopyText = (value: string) => void | Promise<void>;

/** Public copy owned by the presentation layer instead of the portable feedback contract. */
export interface SonnerFeedbackLabels {
  /**
   * Formats the visible reference line.
   * @param code - Incident or domain reference code.
   * @returns Text rendered under the message.
   */
  readonly reference: (code: string) => string;
  readonly copyReference: string;
  readonly referenceCopied: string;
}

export interface SonnerFeedbackPresenterOptions {
  /** Platform clipboard; injected so this package never touches `navigator` or Electron APIs. */
  readonly copyText: CopyText;
  readonly labels?: Partial<SonnerFeedbackLabels>;
}

const DEFAULT_LABELS: SonnerFeedbackLabels = {
  reference: (code) => `Código: ${code}`,
  copyReference: "Copiar código",
  referenceCopied: "Código copiado",
};

/**
 * Presents portable feedback through Sonner for DOM clients (Web and Desktop renderer).
 * The `<Toaster>` viewport is owned by each application; this adapter only issues toasts.
 */
export class SonnerFeedbackPresenter implements FeedbackPresenter {
  private readonly toastIds = new Map<FeedbackHandle, string | number>();
  private readonly copyText: CopyText;
  private readonly labels: SonnerFeedbackLabels;

  /**
   * Creates a Sonner presenter with explicit clipboard access and optional public copy overrides.
   * @param options - Clipboard operation and label overrides; labels default to Spanish copy.
   */
  constructor(options: SonnerFeedbackPresenterOptions) {
    this.copyText = options.copyText;
    this.labels = { ...DEFAULT_LABELS, ...options.labels };
  }

  /**
   * {@inheritDoc FeedbackPresenter.present}
   * Sticky feedback never auto-closes and always shows a close button; a reference code adds a copy control,
   * rendered as the secondary button when the feedback also carries its own action.
   */
  present(feedback: ClientFeedback): FeedbackHandle {
    const referenceCode = feedback.referenceCode;
    const copy = referenceCode === null ? null : {
      label: this.labels.copyReference,
      onClick: () => { void this.copy(referenceCode); },
    };
    const action = feedback.action === null ? copy : {
      label: feedback.action.label,
      onClick: () => { void feedback.action?.perform(); },
    };
    const description = [feedback.description, referenceCode === null ? null : this.labels.reference(referenceCode)]
      .filter((line): line is string => line !== null)
      .join("\n");
    let handle: FeedbackHandle = "";
    const release = () => {
      if (handle) this.toastIds.delete(handle);
    };
    const sticky = feedback.persistence === "sticky";
    const options = {
      ...(description ? { description } : {}),
      ...(feedback.deduplicationKey === null ? {} : { id: feedback.deduplicationKey }),
      ...(action === null ? {} : { action }),
      ...(feedback.action !== null && copy !== null ? { cancel: copy } : {}),
      ...(sticky ? { duration: Number.POSITIVE_INFINITY, closeButton: true } : {}),
      ...(feedback.autoDismissMs === null ? {} : { duration: feedback.autoDismissMs }),
      onDismiss: release,
      onAutoClose: release,
    };
    const toastId = feedback.intent === "error" ? toast.error(feedback.message, options)
      : feedback.intent === "success" ? toast.success(feedback.message, options)
      : feedback.intent === "warning" ? toast.warning(feedback.message, options)
      : feedback.intent === "loading" ? toast.loading(feedback.message, options)
      : toast.info(feedback.message, options);
    handle = `sonner:${String(toastId)}`;
    this.toastIds.set(handle, toastId);
    return handle;
  }

  /** {@inheritDoc FeedbackPresenter.dismiss} */
  dismiss(handle: FeedbackHandle): void {
    toast.dismiss(this.toastIds.get(handle) ?? handle);
    this.toastIds.delete(handle);
  }

  private async copy(referenceCode: string): Promise<void> {
    try {
      await this.copyText(referenceCode);
      toast.success(this.labels.referenceCopied);
    } catch {
      // The code stays visible in the description, so a clipboard denial needs no further feedback.
    }
  }
}
