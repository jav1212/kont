"use client";

import { ResponsiveDrawer } from "@/src/shared/frontend/components/responsive-drawer";

/** Presents the selected fiscal document in the shared responsive side panel.
 * @param props - Visibility, close handler, title, optional subtitle and action footer, and document details.
 * @returns A responsive document drawer that becomes a bottom sheet on mobile.
 */
export function DocumentDrawer({ isOpen, onClose, title, subtitle, footer, isDismissable = true, children }: { readonly isOpen: boolean; readonly onClose: () => void; readonly title: string; readonly subtitle?: React.ReactNode; readonly footer?: React.ReactNode; readonly isDismissable?: boolean; readonly children: React.ReactNode }): React.JSX.Element {
  return <ResponsiveDrawer isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} footer={footer} isDismissable={isDismissable} desktopSize="xl">{children}</ResponsiveDrawer>;
}
