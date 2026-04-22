import { MarketingHeader, MarketingFooter } from "./_components/marketing-navigation";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative min-h-dvh flex flex-col bg-background text-foreground font-mono overflow-hidden">

            {/* Ambient background */}
            <div
                aria-hidden
                className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-surface-2 via-background to-background"
            />
            <div
                aria-hidden
                className="pointer-events-none fixed z-0"
                style={{
                    top: "-20%", left: "-10%",
                    width: "60vw", height: "60vw",
                    background: "radial-gradient(circle, rgba(255,74,24,0.08) 0%, transparent 70%)",
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none fixed z-0"
                style={{
                    bottom: "-20%", right: "-10%",
                    width: "50vw", height: "50vw",
                    background: "radial-gradient(circle, rgba(255,74,24,0.05) 0%, transparent 70%)",
                }}
            />

            <MarketingHeader />

            <main className="relative z-10 flex-1 flex flex-col">
                {children}
            </main>

            <MarketingFooter />
        </div>
    );
}
