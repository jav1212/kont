"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type {
  GlobalInteractionGate,
  InteractionBlockActionKind,
} from "@kontave/client-interaction/application";
import { LogoMark } from "@/src/shared/frontend/components/logo";

/** Props required to present and enforce a global interaction block. */
export interface GlobalInteractionBoundaryProps {
  /** Shared interaction state that selects the highest-priority active block. */
  readonly gate: GlobalInteractionGate;
  /** Application content protected while a block is active. */
  readonly children: ReactNode;
  /** Dispatches an action selected on the currently active block. */
  readonly onAction: (
    token: string,
    action: InteractionBlockActionKind,
  ) => void;
  /** Removes protected content from the tree while blocked when true. */
  readonly unmountContent?: boolean;
}

/**
 * Presents the active global interaction block above protected application
 * content. Active blocks receive modal focus and retain it until resolved.
 *
 * @param props - Gate, protected content, action handler, and unmount policy.
 * @returns Protected application content and an accessible full-screen block.
 */
export function GlobalInteractionBoundary({
  children,
  gate,
  onAction,
  unmountContent = false,
}: GlobalInteractionBoundaryProps): React.JSX.Element {
  const snapshot = useSyncExternalStore(
    gate.subscribe,
    gate.getSnapshot,
    gate.getSnapshot,
  );
  const block = snapshot.activeBlock;
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const blocked = block !== null;

  useEffect(() => {
    if (!blocked) return;
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
      if (!dialogRef.current?.querySelector("button"))
        dialogRef.current?.focus();
    });
    const trapFocus = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trapFocus);
      previouslyFocused.current?.focus();
      previouslyFocused.current = null;
    };
  }, [blocked, block?.token, block?.state]);

  const copyReference = (): void => {
    if (!block?.referenceCode || !navigator.clipboard) return;
    void navigator.clipboard
      .writeText(block.referenceCode)
      .catch(() => undefined);
  };

  return (
    <>
      {!snapshot.activeBlock || !unmountContent ? (
        <div
          inert={snapshot.status === "blocked"}
          aria-hidden={snapshot.status === "blocked" || undefined}
        >
          {children}
        </div>
      ) : null}
      {block ? (
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="fixed inset-0 z-[100] grid place-items-center bg-[var(--background)] px-6 text-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="global-interaction-title"
          aria-describedby={
            block.description ? "global-interaction-description" : undefined
          }
        >
          <div className="max-w-md">
            <div className="mx-auto grid size-[88px] place-items-center rounded-[24px] border border-border-light bg-surface-1 shadow-[var(--shadow-md)]">
              <LogoMark size={38} className="text-foreground" />
            </div>
            <div
              className={
                block.state === "failed"
                  ? "mx-auto mt-10 size-10 rounded-full border-[3px] border-primary-500"
                  : "mx-auto mt-10 size-10 motion-reduce:animate-none animate-spin rounded-full border-[3px] border-primary-500 border-r-transparent"
              }
              role="status"
              aria-label={
                block.state === "failed"
                  ? "La operación requiere atención"
                  : "Cargando"
              }
            />
            <h1
              id="global-interaction-title"
              className="mt-12 font-sans text-4xl font-bold leading-[1.02] tracking-tight text-foreground sm:text-5xl"
            >
              {block.message}
            </h1>
            {block.description ? (
              <p
                id="global-interaction-description"
                className="mt-6 font-sans text-lg text-[var(--text-secondary)]"
              >
                {block.description}
              </p>
            ) : null}
            {block.progress.kind === "determinate" ? (
              <progress
                className="mt-6 w-full accent-primary-500"
                aria-label="Progreso de la operación"
                max={1}
                value={block.progress.value}
              />
            ) : null}
            {block.referenceCode ? (
              <div className="mt-5 text-sm text-[var(--text-secondary)]">
                Código: {block.referenceCode}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={copyReference}
                >
                  Copiar
                </button>
              </div>
            ) : null}
            {block.actions.length > 0 ? (
              <div className="mt-8 flex justify-center gap-3">
                {block.actions.map((action) => (
                  <button
                    type="button"
                    className="rounded-lg bg-primary-500 px-4 py-2 font-sans font-semibold text-white last:bg-surface-2 last:text-foreground"
                    key={action.kind}
                    onClick={() => onAction(block.token, action.kind)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
