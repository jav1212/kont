"use client";

import { useState } from "react";
import { GlobalInteractionGate } from "@kontave/client-interaction";
import { GlobalInteractionBoundary } from "@/src/shared/frontend/components/global-interaction-boundary";

/**
 * Renders the existing global interaction feedback while the authenticated Web
 * application is waiting for its session and workspace boundaries to resolve.
 *
 * @returns The startup interaction block with protected content suppressed.
 */
export function WebApplicationStartupBoundary(): React.JSX.Element {
  const [gate] = useState(() => {
    const startup = new GlobalInteractionGate();
    startup.acquire({
      kind: "startup",
      state: "working",
      priority: 700,
      message: "Preparando Kontave",
      description: "Estamos restaurando tu sesión.",
    });
    return startup;
  });

  return (
    <GlobalInteractionBoundary
      gate={gate}
      onAction={() => undefined}
      unmountContent
    >
      {null}
    </GlobalInteractionBoundary>
  );
}
