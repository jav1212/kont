import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import type { KontaveTheme } from "@kontave/ui/tokens";
import "@fontsource/darker-grotesque/latin-400.css";
import "@fontsource/darker-grotesque/latin-500.css";
import "@fontsource/darker-grotesque/latin-600.css";
import "@fontsource/darker-grotesque/latin-700.css";
import "@fontsource/darker-grotesque/latin-800.css";
import "@fontsource/darker-grotesque/latin-900.css";
import { App } from "./app";
import { applyDesktopTheme } from "./desktop-theme";
import "./styles.css";
import "./presentation/styles.css";

const DesktopUiCatalog = import.meta.env.DEV
  ? lazy(async () => ({
      default: (await import("./presentation/ui-catalog")).DesktopUiCatalog,
    }))
  : null;

const root = document.getElementById("root");
if (!root) throw new Error("Desktop root element was not found.");
const storedTheme = localStorage.getItem("kontave.desktop.theme");
applyDesktopTheme(
  document.documentElement,
  isKontaveTheme(storedTheme) ? storedTheme : "light",
);
createRoot(root).render(
  <StrictMode>
    {DesktopUiCatalog !== null && window.location.hash === "#ui-catalog" ? <Suspense fallback={null}><DesktopUiCatalog /></Suspense> : <App />}
  </StrictMode>,
);

function isKontaveTheme(value: string | null): value is KontaveTheme {
  return value === "light" || value === "dark";
}
