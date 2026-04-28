"use client";

import { useEffect, useState } from "react";
import { notify } from "@/src/shared/frontend/notify";

interface ReferralStats {
    totalReferrals:      number;
    activatedReferrals:  number;
    totalEarnedUsd:      number;
    availableCreditUsd:  number;
}

export interface ReferralInfo {
    referralCode:       string;
    referredBy:         string | null;
    stats:              ReferralStats;
    availableCreditUsd: number;
}

interface State {
    data:    ReferralInfo | null;
    loading: boolean;
}

export function useReferrals() {
    const [state,   setState]   = useState<State>({ data: null, loading: true });
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let cancelled = false;

        const load = () => {
            setState((s) => ({ ...s, loading: true }));
            fetch("/api/referrals/me")
                .then(async (res) => ({ ok: res.ok, json: await res.json() }))
                .then(({ ok, json }) => {
                    if (cancelled) return;
                    if (!ok) {
                        notify.error(json?.error ?? "Error al cargar referidos");
                        setState({ data: null, loading: false });
                    } else {
                        setState({ data: json.data as ReferralInfo, loading: false });
                    }
                })
                .catch(() => {
                    if (cancelled) return;
                    notify.error("Error de red al cargar referidos");
                    setState({ data: null, loading: false });
                });
        };

        load();
        return () => { cancelled = true; };
    }, [version]);

    return {
        ...state,
        reload: () => setVersion((n) => n + 1),
    };
}

interface AvailableCreditState {
    availableUsd: number;
    loading:      boolean;
}

// Hook minimalista para mostrar el crédito disponible en el checkout.
export function useAvailableCredit() {
    const [s,       setS]       = useState<AvailableCreditState>({ availableUsd: 0, loading: true });
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let cancelled = false;

        const load = () => {
            fetch("/api/referrals/available-credit")
                .then(async (res) => ({ ok: res.ok, json: await res.json() }))
                .then(({ ok, json }) => {
                    if (cancelled) return;
                    if (ok && typeof json?.data?.availableUsd === "number") {
                        setS({ availableUsd: json.data.availableUsd, loading: false });
                    } else {
                        setS({ availableUsd: 0, loading: false });
                    }
                })
                .catch(() => {
                    if (cancelled) return;
                    setS({ availableUsd: 0, loading: false });
                });
        };

        load();
        return () => { cancelled = true; };
    }, [version]);

    return {
        ...s,
        reload: () => setVersion((n) => n + 1),
    };
}
