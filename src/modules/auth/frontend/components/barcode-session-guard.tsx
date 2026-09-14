"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LogOut, Timer } from "lucide-react";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { mustLeaveForBarcodeSession, reconcileBarcodeSession, shouldReportBarcodeActivity } from "@/src/modules/auth/frontend/barcode-session-policy";

const CHANNEL_NAME = "kontave-barcode-session";
const ACTIVITY_DEBOUNCE_MS = 30_000;
const FALLBACK_IDLE_LIMIT_MS = 5 * 60 * 1000;
const STATUS_INTERVAL_MS = 30_000;

interface BarcodeSession {
    registered: boolean;
    active: boolean;
    sessionId?: string;
    expiresAt?: string;
    idleExpiresAt?: string;
    terminal?: { ready: boolean; id?: string; name?: string; tenantId?: string };
    tenantId?: string;
}

type GuardState = "checking" | "ordinary" | "active" | "expired";

/**
 * Guards barcode sessions after server-side validation and reports real user
 * activity to the server. Ordinary email/password sessions stay unaffected.
 *
 * @param props - Protected application content and the caller-owned pending feedback.
 * @returns Pending feedback while validation or redirection suppresses content; otherwise protected content.
 */
export function BarcodeSessionGuard({
    children,
    pendingFeedback,
}: {
    readonly children: ReactNode;
    /** Existing application feedback shown while protected content is suppressed. */
    readonly pendingFeedback: ReactNode;
}) {
    const { isAuthenticated, isLoading, lockBarcodeSession } = useAuth();
    const [state, setState] = useState<GuardState>("checking");
    const [session, setSession] = useState<BarcodeSession | null>(null);
    const [locking, setLocking] = useState(false);
    const lockingReference = useRef(false);
    const channel = useRef<BroadcastChannel | null>(null);
    const lastHeartbeatAt = useRef(0);
    const signedOut = !isLoading && !isAuthenticated;

    const redirectToScanner = useCallback((reason: "locked" | "expired") => {
        window.location.replace(`/sign-in?mode=barcode&reason=${reason}`);
    }, []);

    const lock = useCallback(async (expectedSessionId: string, announce: boolean) => {
        if (lockingReference.current) return;
        lockingReference.current = true;
        setLocking(true);
        setState("expired");
        if (announce) channel.current?.postMessage({ type: "lock", sessionId: expectedSessionId });
        await lockBarcodeSession(expectedSessionId);
        redirectToScanner("locked");
    }, [lockBarcodeSession, redirectToScanner]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const response = await apiFetch("/api/auth/barcode/session", { cache: "no-store" });
                const body = await response.json() as { data?: BarcodeSession };
                const resolved = body.data;
                if (cancelled) return;
                if (!response.ok || !resolved) {
                    setState("expired");
                    redirectToScanner("expired");
                    return;
                }
                setSession(resolved);
                if (!resolved.registered) { setState("ordinary"); return; }
                if (mustLeaveForBarcodeSession(resolved)) {
                    setState("expired");
                    redirectToScanner("expired");
                    return;
                }
                setState("active");
            } catch {
                // A network outage must not leave a badge session usable in
                // the UI after its server-side inactivity deadline passes.
                setState("expired");
                redirectToScanner("expired");
            }
        })();
        return () => { cancelled = true; };
    }, [redirectToScanner]);

    useEffect(() => {
        if (isLoading || isAuthenticated) return;
        // A logout in another tab clears the shared Supabase cookies. Hide the
        // previous operator's rendered data before the navigation completes.
        window.location.replace("/sign-in");
    }, [isAuthenticated, isLoading]);

    useEffect(() => {
        if (state !== "active" || !session?.sessionId) return;
        const activeSessionId = session.sessionId;
        const broadcast = new BroadcastChannel(CHANNEL_NAME);
        channel.current = broadcast;
        broadcast.onmessage = (event: MessageEvent<{ type?: string; sessionId?: string }>) => {
            if (event.data.type === "session-changed" && event.data.sessionId !== activeSessionId) {
                setState("expired");
                window.location.replace("/");
                return;
            }
            if (event.data.type === "lock" && event.data.sessionId === activeSessionId) void lock(activeSessionId, false);
        };
        const reportActivity = (event: Event) => {
            const now = Date.now();
            if (!shouldReportBarcodeActivity((event as { isTrusted?: boolean }).isTrusted === true, now, lastHeartbeatAt.current, ACTIVITY_DEBOUNCE_MS)) return;
            lastHeartbeatAt.current = now;
            void apiFetch("/api/auth/barcode/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: activeSessionId }),
            }).then((response) => {
                if (!response.ok) void lock(activeSessionId, true);
            }).catch(() => void lock(activeSessionId, true));
        };
        const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
        events.forEach((event) => window.addEventListener(event, reportActivity, { passive: true }));
        const idleDeadline = (candidate?: string) => {
            const serverDeadline = candidate ? Date.parse(candidate) : Number.NaN;
            return Number.isFinite(serverDeadline) ? serverDeadline : Date.now() + FALLBACK_IDLE_LIMIT_MS;
        };
        let deadline = idleDeadline(session.idleExpiresAt);
        const resetIdleDeadline = (event: Event) => {
            if ((event as { isTrusted?: boolean }).isTrusted) deadline = Date.now() + FALLBACK_IDLE_LIMIT_MS;
        };
        events.forEach((event) => window.addEventListener(event, resetIdleDeadline, { passive: true }));
        const idleTimer = window.setInterval(() => {
            if (Date.now() >= deadline) void lock(activeSessionId, true);
        }, 1_000);
        const statusTimer = window.setInterval(() => {
            void apiFetch("/api/auth/barcode/session", { cache: "no-store" }).then(async (response) => {
                const body = await response.json() as { data?: BarcodeSession };
                const outcome = body.data ? reconcileBarcodeSession(activeSessionId, body.data) : "expired";
                if (outcome === "expired" || !response.ok) void lock(activeSessionId, true);
                if (outcome === "changed") {
                    setState("expired");
                    window.location.replace("/");
                }
                if (outcome === "active") deadline = idleDeadline(body.data?.idleExpiresAt);
            }).catch(() => void lock(activeSessionId, true));
        }, STATUS_INTERVAL_MS);
        return () => {
            events.forEach((event) => window.removeEventListener(event, reportActivity));
            events.forEach((event) => window.removeEventListener(event, resetIdleDeadline));
            window.clearInterval(idleTimer);
            window.clearInterval(statusTimer);
            broadcast.close();
            channel.current = null;
        };
    }, [lock, session?.idleExpiresAt, session?.sessionId, state]);

    if (signedOut || state === "checking" || state === "expired") return pendingFeedback;

    return <>
        {children}
        {state === "active" && session?.sessionId && (
            <div className="fixed bottom-4 right-4 z-[60] rounded-xl border border-border-light bg-surface-1 p-2 shadow-lg">
                <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-primary-500" aria-hidden />
                    <span className="hidden max-w-40 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary sm:inline">{session.terminal?.name ?? "Terminal"}</span>
                    <BaseButton.Root size="sm" variant="secondary" disabled={locking} onClick={() => void lock(session.sessionId!, true)} leftIcon={<LogOut size={13} />}>Cambiar usuario</BaseButton.Root>
                </div>
            </div>
        )}
    </>;
}
