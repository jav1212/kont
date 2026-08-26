/** Active organization billing state used by the Desktop shell. */
export type DesktopBillingPlanState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | {
      readonly status: "ready";
      readonly organizationId: string;
      readonly planName: string | null;
    };
export interface DesktopBillingApi {
  getPlan(): Promise<DesktopBillingPlanState>;
  subscribe(listener: (state: DesktopBillingPlanState) => void): () => void;
}
