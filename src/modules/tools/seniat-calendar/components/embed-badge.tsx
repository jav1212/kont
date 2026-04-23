"use client";

export function EmbedBadge() {
    return (
        <a
            href="https://konta.app"
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 h-8 px-3 rounded-full border border-border-light bg-surface-1 shadow-md text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary hover:text-text-secondary hover:border-border-medium transition-colors duration-150"
        >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
                <path d="M12 2L2 12h4v8h4v-6h4v6h4v-8h4L12 2z" fill="currentColor" />
            </svg>
            Powered by Konta
        </a>
    );
}
