// ============================================================================
// Embed layout — minimal, no MarketingHeader/Footer
// Used for /herramientas/calendario-seniat/embed?rif=J-...
// ============================================================================

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-foreground font-mono">
            {children}
        </div>
    );
}
