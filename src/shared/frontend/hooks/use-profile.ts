"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";

export interface ProfileData { name: string | null; avatarUrl: string | null; }

export function useProfile() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<ProfileData>({ name: null, avatarUrl: null });

    useEffect(() => {
        if (!user?.id) return;
        fetch(`/api/users/get-by-id?id=${user.id}`)
            .then((r) => r.json())
            .then((r) => { if (r.data) setProfile({ name: r.data.name ?? null, avatarUrl: r.data.avatarUrl ?? null }); })
            .catch(() => {});
    }, [user?.id]);

    return { profile, email: user?.email ?? null };
}
