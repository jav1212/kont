"use client";

import { useCallback, useEffect, useState } from "react";
import type { AriDeclaration } from "@/src/modules/payroll/backend/domain/ari-declaration";
import { computeAri } from "@/src/modules/payroll/backend/domain/ari-declaration";
import type { AriDeclarationInput, AriResult } from "@/src/modules/payroll/backend/domain/ari-declaration";
import { fetchJson } from "@/src/shared/frontend/utils/api-fetch";
import { notify } from "@/src/shared/frontend/notify";

export type { AriDeclaration, AriDeclarationInput, AriResult };
export { computeAri };

interface UseAriResult {
    declarations: AriDeclaration[];
    loading:      boolean;
    reload:       () => Promise<void>;
    save:         (declaration: Omit<AriDeclaration, "companyId">) => Promise<boolean>;
    remove:       (id: string) => Promise<boolean>;
}

/**
 * Carga y persiste las declaraciones AR-I de una empresa vía /api/payroll/ari.
 * El backend recalcula el porcentaje y lo propaga a employees.porcentaje_islr.
 */
export function useAri(companyId: string | null): UseAriResult {
    const [declarations, setDeclarations] = useState<AriDeclaration[]>([]);
    const [loading, setLoading]           = useState(false);

    const reload = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const { ok, json } = await fetchJson(`/api/payroll/ari?companyId=${companyId}`);
        if (!ok) notify.error(json.error ?? "Error al cargar declaraciones AR-I");
        else     setDeclarations((json.data as AriDeclaration[]) ?? []);
        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets loading before first await (non-cascading en React 18)
        if (companyId) reload();
    }, [companyId, reload]);

    const save = useCallback(async (declaration: Omit<AriDeclaration, "companyId">): Promise<boolean> => {
        if (!companyId) { notify.error("No hay empresa seleccionada"); return false; }
        const { ok, json } = await fetchJson("/api/payroll/ari", {
            method:  "PUT",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ companyId, declaration }),
        });
        if (!ok) { notify.error(json.error ?? "Error al guardar la declaración AR-I"); return false; }
        await reload();
        return true;
    }, [companyId, reload]);

    const remove = useCallback(async (id: string): Promise<boolean> => {
        if (!companyId) { notify.error("No hay empresa seleccionada"); return false; }
        const { ok, json } = await fetchJson("/api/payroll/ari", {
            method:  "DELETE",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ id }),
        });
        if (!ok) { notify.error(json.error ?? "Error al eliminar la declaración AR-I"); return false; }
        await reload();
        return true;
    }, [companyId, reload]);

    return {
        declarations: companyId ? declarations : [],
        loading:      companyId ? loading : false,
        reload,
        save,
        remove,
    };
}
