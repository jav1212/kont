import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { SalesReceivablesScreen } from "@/src/modules/sales/frontend/components/sales-receivables-screen";

export default function SalesReceivablesPage() {
    return <div className="min-h-full bg-surface-2">
        <PageHeader title="Cuentas por cobrar" subtitle="Ventas a crédito, vencimientos y abonos" />
        <SalesReceivablesScreen />
    </div>;
}
