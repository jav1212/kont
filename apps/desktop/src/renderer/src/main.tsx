import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyDesignTokens } from "@kontave/design-tokens";
import { ToastViewport } from "@kontave/ui-dom";
import "@fontsource/dosis/latin-400.css";
import "@fontsource/dosis/latin-500.css";
import "@fontsource/dosis/latin-600.css";
import "@fontsource/dosis/latin-700.css";
import "@fontsource/darker-grotesque/latin-600.css";
import "@fontsource/darker-grotesque/latin-700.css";
import "@fontsource/darker-grotesque/latin-800.css";
import "@fontsource/darker-grotesque/latin-900.css";
import { App } from "./app.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Desktop root element was not found.");
applyDesignTokens(document.documentElement, "light");
createRoot(root).render(<StrictMode><App /><ToastViewport /></StrictMode>);
