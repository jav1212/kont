// Payroll layout.
// DesktopOnlyGuard is applied per-page inside this layout, not here,
// so the /payroll/tablero dashboard remains accessible on mobile/PWA.
export default function PayrollLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
