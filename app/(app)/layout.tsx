import { AppSidebar }      from "@/src/shared/frontend/components/app-sidebar";
import { CompanyProvider } from "@/src/modules/companies/frontend/components/company-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <CompanyProvider>
            <div className="flex h-screen bg-surface-2 overflow-hidden">
                <AppSidebar />
                <main className="flex-1 min-w-0 overflow-hidden">
                    {children}
                </main>
            </div>
        </CompanyProvider>
    );
}
