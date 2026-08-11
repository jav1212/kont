import type { KontaveDesktopApi } from "../../shared/desktop-api.js";

declare global {
  interface Window { readonly kontave: KontaveDesktopApi; }
}

export {};
