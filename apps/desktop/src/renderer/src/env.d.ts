import type { KontaveRendererBridge } from "../../renderer-bridge";

declare global {
  interface Window {
    readonly kontave: KontaveRendererBridge;
  }
}

export {};
