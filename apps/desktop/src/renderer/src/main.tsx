import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyDesignTokens } from "@kontave/design-tokens";
import { App } from "./app.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Desktop root element was not found.");
applyDesignTokens(document.documentElement, "light");
createRoot(root).render(<StrictMode><App /></StrictMode>);
