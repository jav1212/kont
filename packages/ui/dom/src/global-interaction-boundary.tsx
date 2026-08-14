import { useSyncExternalStore, type ReactNode } from "react";
import type {
  GlobalInteractionGate,
  InteractionBlockActionKind,
} from "@kontave/client-interaction-application";
import { Button } from "./button.js";
import { LogoMark } from "./logo.js";
import { Text } from "./text.js";

export interface GlobalInteractionBoundaryProps {
  readonly gate: GlobalInteractionGate;
  readonly children: ReactNode;
  readonly onAction: (token: string, action: InteractionBlockActionKind) => void;
}

export function GlobalInteractionBoundary({ children, gate, onAction }: GlobalInteractionBoundaryProps) {
  const snapshot = useSyncExternalStore(gate.subscribe, gate.getSnapshot, gate.getSnapshot);
  const blocked = snapshot.status === "blocked";
  const activeBlock = snapshot.activeBlock;

  return <>
    <div className="kt-global-interaction__application" inert={blocked} aria-hidden={blocked || undefined}>
      {children}
    </div>
    {activeBlock ? <div
      className="kt-global-interaction"
      data-state={activeBlock.state}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kt-global-interaction-title"
      aria-describedby={activeBlock.description ? "kt-global-interaction-description" : undefined}
    >
      <div className="kt-global-interaction__content">
        <div className="kt-global-interaction__brand" aria-hidden="true"><LogoMark size={30} /></div>
        <LoadingAnimation state={activeBlock.state} />
        <Text as="h1" id="kt-global-interaction-title" tone="inherit">{activeBlock.message}</Text>
        {activeBlock.description ? <Text as="p" id="kt-global-interaction-description" tone="inherit">
          {activeBlock.description}
        </Text> : null}
        {activeBlock.progress.kind === "determinate" ? <progress
          aria-label="Progreso de la operación"
          max={1}
          value={activeBlock.progress.value}
        /> : null}
        {activeBlock.referenceCode ? <Text as="small" className="kt-global-interaction__reference" tone="inherit">
          Código: {activeBlock.referenceCode}
        </Text> : null}
        {activeBlock.actions.length > 0 ? <div className="kt-global-interaction__actions">
          {activeBlock.actions.map((action) => <Button
            intent={action.kind === "exit" ? "neutral" : "primary"}
            key={action.kind}
            onClick={() => onAction(activeBlock.token, action.kind)}
          >{action.label}</Button>)}
        </div> : null}
      </div>
    </div> : null}
  </>;
}

export function LoadingAnimation({ state = "working" }: { readonly state?: "working" | "waiting" | "failed" }) {
  return <div
    className="kt-loading-animation"
    data-state={state}
    role="status"
    aria-label={state === "failed" ? "La operación requiere atención" : "Cargando"}
  />;
}
