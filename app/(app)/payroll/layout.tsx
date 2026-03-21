import { DesktopOnlyGuard } from "@/src/shared/frontend/components/desktop-only-guard";

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
    return <DesktopOnlyGuard>{children}</DesktopOnlyGuard>;
}
