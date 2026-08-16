import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { KontaveTheme } from "@kontave/design-tokens";
import { GlobalInteractionBoundary, ToastViewport } from "@kontave/ui-dom";
import "@fontsource/darker-grotesque/latin-400.css";
import "@fontsource/darker-grotesque/latin-500.css";
import "@fontsource/darker-grotesque/latin-600.css";
import "@fontsource/darker-grotesque/latin-700.css";
import "@fontsource/darker-grotesque/latin-800.css";
import "@fontsource/darker-grotesque/latin-900.css";
import { App } from "./app";
import { handleGlobalInteractionAction, interactionGate } from "./client-interaction";
import { applyDesktopTheme } from "./desktop-theme";
import "./styles.css";
import "./inventory-operations.css";

const root = document.getElementById("root");
if (!root) throw new Error("Desktop root element was not found.");
const storedTheme = localStorage.getItem("kontave.desktop.theme");
applyDesktopTheme(document.documentElement, isKontaveTheme(storedTheme) ? storedTheme : "light");
createRoot(root).render(
  <StrictMode>
    <GlobalInteractionBoundary gate={interactionGate} onAction={handleGlobalInteractionAction}>
      <App />
      <ToastViewport />
    </GlobalInteractionBoundary>
  </StrictMode>,
);

function isKontaveTheme(value: string | null): value is KontaveTheme {
  return value === "light" || value === "dark";
}
