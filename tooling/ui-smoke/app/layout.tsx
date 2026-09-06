import type { ReactNode } from "react";

/**
 * Supplies the isolated App Router document used to verify UI server rendering.
 * @param props - Server-rendered route content.
 * @returns A Spanish HTML document with no application dependencies.
 */
export default function Layout({ children }: { readonly children: ReactNode }) {
  return <html lang="es"><body style={{ margin: 0 }}>{children}</body></html>;
}
