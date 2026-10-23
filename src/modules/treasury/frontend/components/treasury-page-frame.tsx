"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";

/** Properties that define the common Treasury page canvas and top bar. */
export interface TreasuryPageFrameProps {
  /** Page title shown in the global bar and content canvas. */
  readonly title: string;
  /** Optional explanatory text shown below the canvas title. */
  readonly description?: string;
  /** Optional controls aligned with the canvas heading. */
  readonly toolbar?: ReactNode;
  /** Optional primary action rendered in the global bar. */
  readonly primaryAction?: ReactNode;
  /** Optional secondary actions rendered in the global bar. */
  readonly secondaryActions?: ReactNode;
  /** Page-specific content rendered below the heading. */
  readonly children: ReactNode;
}

/** Renders the consistent full-width top bar and bounded content canvas for Treasury routes.
 * @param props - Title, optional actions and toolbar, and the route content.
 * @returns A Treasury page with the shared top-bar and accessible canvas heading.
 */
export function TreasuryPageFrame({ title, description, toolbar, primaryAction, secondaryActions, children }: TreasuryPageFrameProps): React.JSX.Element {
  return <main className="min-h-full bg-surface-2">
    <PageHeader title={title} primaryAction={primaryAction} secondaryActions={secondaryActions} />
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>}</div>
        {toolbar}
      </header>
      {children}
    </div>
  </main>;
}
