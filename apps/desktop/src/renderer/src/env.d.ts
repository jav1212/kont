import type { KontaveDesktopApi } from "../../shared/desktop-api";

declare global {
  interface Window { readonly kontave: KontaveDesktopApi; }
}

export {};
