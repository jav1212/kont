// Accounting module layout.
// Mirrors the pattern used by payroll and inventory layouts:
// wraps content in DesktopOnlyGuard since accounting requires desktop viewport.
import { DesktopOnlyGuard } from "@/src/shared/frontend/components/desktop-only-guard";

export default function AccountingLayout({ children }: { children: React.ReactNode }) {
    return <DesktopOnlyGuard>{children}</DesktopOnlyGuard>;
}
