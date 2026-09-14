import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GlobalInteractionGate } from "@kontave/client-interaction/application";
import { GlobalInteractionBoundary } from "../src/shared/frontend/components/global-interaction-boundary";
import { BarcodeSessionGuard } from "../src/modules/auth/frontend/components/barcode-session-guard";
import { WebApplicationProvider } from "../src/modules/workspace/frontend/web-application-provider";
import { WebApplicationStartupBoundary } from "../src/modules/workspace/frontend/web-application-startup-boundary";

test("Web interaction boundary renders an accessible branded failure with recovery", () => {
  const gate = new GlobalInteractionGate();
  gate.acquire({
    kind: "unexpected_failure",
    state: "failed",
    priority: 1,
    message: "No pudimos cargar",
    description: "Reintenta.",
    referenceCode: "WEB-1",
    actions: [{ kind: "retry", label: "Reintentar" }],
  });
  const markup = renderToStaticMarkup(
    <GlobalInteractionBoundary gate={gate} onAction={() => undefined}>
      <main>Contenido previo</main>
    </GlobalInteractionBoundary>,
  );
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /No pudimos cargar/);
  assert.match(markup, /Reintentar/);
  assert.match(markup, /Código: WEB-1/);
  assert.match(markup, /Contenido previo/);
});

test("Web interaction boundary can unmount stale content while blocked", () => {
  const gate = new GlobalInteractionGate();
  gate.acquire({
    kind: "startup",
    state: "working",
    priority: 1,
    message: "Restaurando",
    actions: [],
  });
  const markup = renderToStaticMarkup(
    <GlobalInteractionBoundary
      gate={gate}
      onAction={() => undefined}
      unmountContent
    >
      <main>Contenido previo</main>
    </GlobalInteractionBoundary>,
  );
  assert.doesNotMatch(markup, /Contenido previo/);
  assert.match(markup, /Restaurando/);
});

test("initial session verification renders global feedback before effects without exposing protected content", () => {
  const markup = renderToStaticMarkup(
    <BarcodeSessionGuard pendingFeedback={<WebApplicationStartupBoundary />}>
      <main>Contenido protegido</main>
    </BarcodeSessionGuard>,
  );
  assert.match(markup, /Preparando Kontave/);
  assert.match(markup, /Estamos restaurando tu sesión/);
  assert.match(markup, /aria-label="Cargando"/);
  assert.equal((markup.match(/role="dialog"/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /Contenido protegido/);
});

test("Web provider supplies the global feedback during server-rendered startup", () => {
  const markup = renderToStaticMarkup(
    <WebApplicationProvider><main>Contenido protegido</main></WebApplicationProvider>,
  );
  assert.match(markup, /Preparando Kontave/);
  assert.equal((markup.match(/role="dialog"/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /Contenido protegido/);
});

test("a suspended application uses the same global feedback before hydration", () => {
  function PendingApplication(): React.JSX.Element {
    throw new Promise(() => undefined);
  }
  const markup = renderToStaticMarkup(
    <React.Suspense fallback={<WebApplicationStartupBoundary />}>
      <PendingApplication />
    </React.Suspense>,
  );
  assert.match(markup, /Preparando Kontave/);
  assert.equal((markup.match(/role="dialog"/g) ?? []).length, 1);
  assert.match(markup, /aria-label="Cargando"/);
});
