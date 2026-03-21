"use client";

interface MobileTopBarProps {
    onMenuClick: () => void;
}

export function MobileTopBar({ onMenuClick }: MobileTopBarProps) {
    return (
        <header
            className="xl:hidden flex-shrink-0 flex items-center gap-3 px-4 bg-sidebar-bg border-b border-sidebar-border"
            style={{
                height: "calc(3.5rem + env(safe-area-inset-top))",
                paddingTop: "env(safe-area-inset-top)",
            }}
        >
            {/* Hamburger */}
            <button
                onClick={onMenuClick}
                aria-label="Abrir menú de navegación"
                className="flex items-center justify-center w-9 h-9 rounded-lg text-sidebar-fg hover:bg-sidebar-bg-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border flex-shrink-0"
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M2 4h12M2 8h12M2 12h12" />
                </svg>
            </button>

            {/* Logo */}
            <div className="flex items-center gap-2.5">
                <div
                    className="w-7 h-7 rounded-[5px] flex items-center justify-center flex-shrink-0 bg-primary-500"
                    aria-hidden="true"
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <rect x="1" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.95" />
                        <rect x="8" y="1" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.38" />
                        <rect x="1" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.38" />
                        <rect x="8" y="8" width="5" height="5" rx="0.5" fill="white" fillOpacity="0.95" />
                    </svg>
                </div>
                <span className="font-mono text-[13px] font-bold uppercase tracking-widest text-sidebar-fg-hover">
                    Kont
                </span>
            </div>
        </header>
    );
}
