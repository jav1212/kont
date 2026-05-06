import { PageLoadingSkeleton } from "@/src/shared/frontend/components/page-loading-skeleton";

export default function PayrollEmployeesLoading() {
    return <PageLoadingSkeleton rows={10} columns={5} />;
}
