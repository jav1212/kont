import { PayrollTableView } from '@/src/components/payroll-table-view';
import { Suspense } from 'react';
export default function PayrollPage() {
    return (
        // El Suspense DEBE estar en el padre de cualquier componente que use useSearchParams
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen font-mono text-sm text-neutral-500">
                Cargando datos de nómina...
            </div>
        }>
            <PayrollTableView />
        </Suspense>
    );
}