"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useDeviceSubscription } from "@/src/shared/frontend/devices/device-manager-provider";
import { isValidBadgeBarcode } from "@/src/shared/frontend/devices/barcode-access-policy";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BARCODE_LOGIN_LANDING_HREF } from "@/src/modules/workspace/frontend/barcode-workspace-landing";
import type { WebApplicationController } from "@/src/modules/workspace/frontend/web-application-controller";

interface WorkspaceBarcodeSessionSwitcherProps {
  /** Current application's isolated workspace runtime. */
  readonly controller: WebApplicationController;
  /** Enables capture only after a workspace has been fully resolved. */
  readonly active: boolean;
}

/**
 * Replaces the active operator when a valid access badge is scanned inside a
 * resolved workspace.
 *
 * Product scans remain with their current workflow: this subscriber receives
 * only complete badge-shaped values and blocks the UI during the credential
 * exchange, before any state owned by the former operator can be used again.
 *
 * @param props - Current workspace runtime and capture readiness.
 * @returns No visible content; the component owns the scanner subscription.
 */
export function WorkspaceBarcodeSessionSwitcher({
  controller,
  active,
}: WorkspaceBarcodeSessionSwitcherProps): null {
  const { signInWithBarcode } = useAuth();
  const inFlight = useRef(false);
  const releaseBlock = useRef<(() => void) | null>(null);

  useEffect(
    () => () => releaseBlock.current?.(),
    [],
  );

  const handleScan = useCallback(
    async ({ barcode }: { readonly barcode: string }): Promise<void> => {
      const credential = barcode.trim();
      if (
        !isValidBadgeBarcode(credential) ||
        inFlight.current ||
        controller.interaction.getSnapshot().activeBlock
      )
        return;
      inFlight.current = true;
      const lease = controller.interaction.acquire({
        kind: "exclusive_operation",
        state: "working",
        priority: 1_000,
        message: "Cambiando de operador",
        description: "Estamos actualizando el espacio de trabajo autorizado.",
      });
      releaseBlock.current = () => lease.release();
      const error = await signInWithBarcode(
        credential,
        controller.getSnapshot().tenantId,
      );
      if (!error) {
        // A full navigation drops every mounted feature hook and cache before
        // the replacement session restores its independently authorized view.
        window.location.replace(BARCODE_LOGIN_LANDING_HREF);
        return;
      }
      releaseBlock.current?.();
      releaseBlock.current = null;
      inFlight.current = false;
      toast.error(error);
    },
    [controller, signInWithBarcode],
  );

  useDeviceSubscription("access", handleScan, active);

  return null;
}
