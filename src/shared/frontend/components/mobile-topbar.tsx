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

            {/* Logo — K. monogram */}
            <div className="flex items-end leading-none gap-0" aria-label="Konta">
                <span className="text-sidebar-fg font-sans font-black text-[19px] leading-none tracking-[-0.02em]">K</span>
                <span className="font-black text-[19px] leading-none" style={{ color: '#FF4A18' }}>.</span>
            </div>
        </header>
    );
}
