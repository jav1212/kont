"use client";

import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import {
    associatePurchaseItems,
    calculatePurchaseCsvRow,
    parsePurchaseHeaders,
    parsePurchaseItems,
    normalizePurchaseRif,
    type PurchaseCsvConfig,
    type PurchaseCsvImportRow,
} from "../../backend/domain/purchase-csv-import";
import type { PurchaseCsvImportBatch, PurchaseCsvImportLineExecution } from "../../backend/domain/repository/purchase-csv-import.repository";

export type ImportStage = "headers" | "details" | "preview" | "execute";
export type ImportIssue = { code: string; message: string; severity: "error" | "warning"; purchaseKey?: string };
export type ImportPurchase = {
    key: string; document: string; supplierName: string; supplierRif: string; supplierExternalId?: string;
    date: string; currency: string; exchangeRate?: number; sourceTotalBs: number; calculatedTotalBs?: number;
    selected: boolean; detailCount: number; status?: "ready" | "pending" | "duplicate" | "unsupported";
};
export type ImportLine = {
    key: string; purchaseKey: string; code: string; detail: string; quantity: number; unitCostBs: number;
    subtotalBs: number; taxCode?: string; currency?: string; exchangeRate?: number; productStatus?: "matched" | "missing" | "ambiguous";
};
export type PurchaseImportSession = {
    id?: string; purchases: ImportPurchase[]; lines: ImportLine[]; issues: ImportIssue[];
    taxCodes: string[]; sourceRif?: string; results?: Array<{ purchaseKey: string; status: "saved" | "confirmed" | "failed"; message?: string }>;
};

type PersistedBatch = PurchaseCsvImportBatch;

async function readResponse(response: Response): Promise<{ data?: unknown; error?: string }> {
    return response.json().catch(() => ({ error: "La respuesta del servidor no es válida." }));
}

/** Client adapter for the CSV import API. Parsing happens locally with the shared, whitelisted domain parser. */
function toSession(batch: PersistedBatch): PurchaseImportSession {
    const calculated = batch.rows.map((row) => calculatePurchaseCsvRow(row, batch.config));
    return {
        id: batch.id,
        purchases: batch.rows.map((row, index) => ({
            key: String(row.header.sourceRow), document: row.header.documentNumber, supplierName: row.header.supplierName,
            supplierRif: row.header.supplierRif, supplierExternalId: row.header.supplierExternalId, date: row.header.date,
            currency: row.header.currency, exchangeRate: Number(row.header.exchangeRate), sourceTotalBs: Number(row.header.totalBs),
            calculatedTotalBs: Number(calculated[index]?.total), selected: row.selected, detailCount: row.items.length,
            status: calculated[index]?.complete ? "ready" : row.items.length ? "pending" : "pending",
        })),
        lines: batch.rows.flatMap((row) => row.items.map((item) => ({
            key: `${row.header.sourceRow}:${item.sourceRow}`, purchaseKey: String(row.header.sourceRow), code: item.code,
            detail: item.description, quantity: Number(item.quantity), unitCostBs: Number(item.unitCostBs),
            subtotalBs: Number(item.subtotalBs), taxCode: item.purchaseVatCode, currency: item.currency,
            exchangeRate: Number(item.exchangeRate), productStatus: row.productResolutions[item.code]?.productId ? "matched" : "missing",
        }))),
        issues: calculated.flatMap((result, index) => [...result.errors.map((message) => ({ code: "validation", message, severity: "error" as const, purchaseKey: String(batch.rows[index].header.sourceRow) })), ...result.warnings.map((message) => ({ code: "warning", message, severity: "warning" as const, purchaseKey: String(batch.rows[index].header.sourceRow) }))]),
        taxCodes: [...new Set(batch.rows.flatMap((row) => row.items.flatMap((item) => [item.purchaseVatCode, item.saleVatCode]).filter(Boolean)))],
        sourceRif: batch.companyRif,
    };
}

/**
 * Owns exact staged import snapshots and authenticated, revision-aware API actions.
 * @returns Current batch, presentation state and actions; expected failures populate `error`.
 * @remarks Reset invalidates in-flight responses when the company changes.
 */
export function usePurchaseImport() {
    const [session, setSession] = useState<PurchaseImportSession | null>(null);
    const [batch, setBatch] = useState<PersistedBatch | null>(null);
    const [resumable, setResumable] = useState<PersistedBatch[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const generation = useRef(0);

    const commit = useCallback((next: PersistedBatch, expectedGeneration?: number) => {
        if (expectedGeneration !== undefined && expectedGeneration !== generation.current) return;
        setBatch(next); setSession(toSession(next));
    }, []);

    const submitFiles = useCallback(async (stage: "headers" | "details", companyId: string, files: File[], companyRif: string, sessionId?: string) => {
        if (files.length === 0) return null;
        const requestGeneration = generation.current;
        setLoading(true); setError(null);
        try {
            const texts = await Promise.all(files.map((file) => file.text()));
            if (new Set(texts.map(text => text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"))).size !== texts.length) {
                throw new Error("Seleccionaste el mismo contenido CSV más de una vez.");
            }
            const headerResults = stage === "headers" ? texts.map(parsePurchaseHeaders) : [];
            const itemResults = stage === "details" ? texts.map(parsePurchaseItems) : [];
            const parserErrors = [...headerResults, ...itemResults].flatMap((result) => result.errors);
            if (parserErrors.length) throw new Error(parserErrors.join(" · "));
            const reportedRifs = [...headerResults, ...itemResults].map((result) => result.companyRif).filter(Boolean);
            if (reportedRifs.some((rif) => normalizePurchaseRif(rif) !== normalizePurchaseRif(companyRif))) {
                throw new Error("El RIF del archivo no corresponde a la empresa activa.");
            }
            if (requestGeneration !== generation.current) return null;
            const headers = stage === "headers" ? headerResults.flatMap((result) => result.rows) : [];
            const items = stage === "details" ? itemResults.flatMap((result) => result.rows) : [];
            // Server owns the durable batch. Detail upload reloads existing rows before replacing their associations.
            const existingBatch = batch?.id === sessionId ? batch : sessionId ? (await apiFetch(`/api/purchases/imports/${encodeURIComponent(sessionId)}?companyId=${encodeURIComponent(companyId)}`).then(readResponse)).data as PersistedBatch | undefined : undefined;
            if (requestGeneration !== generation.current) return null;
            const existingRows = existingBatch?.rows ?? [];
            const sourceHeaders = stage === "headers" ? headers : existingRows.map((row: PurchaseCsvImportRow) => row.header);
            const storedItems = existingRows.flatMap((row: PurchaseCsvImportRow) => row.items);
            const sourceItems = stage === "details" ? [...storedItems, ...items] : storedItems;
            if (stage === "details" && items.some((item) => storedItems.some((stored) => stored.documentNumber === item.documentNumber && stored.supplierExternalId === item.supplierExternalId && stored.date === item.date && stored.code === item.code && stored.quantity === item.quantity && stored.unitCostBs === item.unitCostBs && stored.subtotalBs === item.subtotalBs))) {
                throw new Error("El archivo contiene un detalle que ya fue adjuntado. Revisa el archivo para evitar duplicar renglones.");
            }
            const associations = associatePurchaseItems(sourceHeaders, sourceItems);
            if (associations.errors.length) throw new Error(associations.errors.join(" · "));
            const config: PurchaseCsvConfig = existingBatch?.config ?? { costsIncludeVat: false, vatMappings: {}, reviewed: false };
            const sourceCompanyRif = reportedRifs[0] ?? existingBatch?.companyRif ?? companyRif;
            const rows: PurchaseCsvImportRow[] = sourceHeaders.map((header) => {
                const previous = existingRows.find((row) => row.header.sourceRow === header.sourceRow);
                return { header, items: associations.assignments[header.sourceRow] ?? [], selected: previous?.selected ?? true, supplierId: previous?.supplierId, productResolutions: previous?.productResolutions ?? {}, acceptDifference: false };
            });
            const response = await apiFetch("/api/purchases/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sessionId, revision: existingBatch?.revision, companyId, fileName: existingBatch?.fileName ?? files.map((file) => file.name).join(", "), companyRif: sourceCompanyRif, rows, config }) });
            const json = await readResponse(response);
            if (!response.ok || !json.data) throw new Error(json.error ?? "No se pudo procesar el archivo.");
            const next = json.data as PersistedBatch; commit(next, requestGeneration); return toSession(next);
        } catch (cause) {
            if (requestGeneration !== generation.current) return null;
            const message = cause instanceof Error ? cause.message : "No se pudo procesar el archivo.";
            setError(message); return null;
        } finally { if (requestGeneration === generation.current) setLoading(false); }
    }, [batch, commit]);

    const updateSession = useCallback(async (companyId: string, payload: Record<string, unknown>) => {
        if (!session?.id) return null;
        const requestGeneration = generation.current;
        setLoading(true); setError(null);
        try {
            if (!batch) throw new Error("No se encontró el lote de importación.");
            const rows = batch.rows.map((row) => {
                const selections = payload.selections as Array<{ key: string; selected: boolean }> | undefined;
                const chosen = selections?.find((entry) => entry.key === String(row.header.sourceRow));
                const resolutions = payload.resolutions as Record<string, PurchaseCsvImportRow["productResolutions"]> | undefined;
                const suppliers = payload.suppliers as Record<string, string> | undefined;
                const acceptances = payload.acceptances as Record<string, boolean> | undefined;
                const clearDetail = payload.clearDetails === row.header.sourceRow && row.invoiceStatus !== "confirmada";
                return {
                    ...row,
                    ...(clearDetail ? { items: [], productResolutions: {}, acceptDifference: false } : {}),
                    ...(chosen ? { selected: chosen.selected, acceptDifference: false } : {}),
                    ...(resolutions?.[String(row.header.sourceRow)] ? { productResolutions: resolutions[String(row.header.sourceRow)], acceptDifference: false } : {}),
                    ...(suppliers?.[String(row.header.sourceRow)] !== undefined ? { supplierId: suppliers[String(row.header.sourceRow)] || undefined, acceptDifference: false } : {}),
                    ...(acceptances?.[String(row.header.sourceRow)] !== undefined ? { acceptDifference: acceptances[String(row.header.sourceRow)] } : {}),
                    ...(payload.costIncludesVat !== undefined ? { acceptDifference: false } : {}),
                };
            });
            const config = { ...batch.config, ...(payload.costIncludesVat === undefined ? {} : { costsIncludeVat: Boolean(payload.costIncludesVat), vatMappings: payload.taxMappings as PurchaseCsvConfig["vatMappings"], reviewed: payload.configReviewed === true }) };
            const response = await apiFetch("/api/purchases/imports", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...batch, revision: batch.revision, companyId, rows, config }),
            });
            const json = await readResponse(response);
            if (!response.ok || !json.data) throw new Error(json.error ?? "No se pudo actualizar la importación.");
            const next = json.data as PersistedBatch; commit(next, requestGeneration); return toSession(next);
        } catch (cause) {
            if (requestGeneration !== generation.current) return null;
            const message = cause instanceof Error ? cause.message : "No se pudo actualizar la importación.";
            setError(message); return null;
        } finally { if (requestGeneration === generation.current) setLoading(false); }
    }, [batch, commit, session?.id]);

    const execute = useCallback(async (companyId: string, mode: "draft" | "confirm") => {
        if (!session?.id) return null;
        const requestGeneration = generation.current;
        setLoading(true); setError(null);
        try {
            const response = await apiFetch(`/api/purchases/imports/${encodeURIComponent(session.id)}/execute`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, mode, revision: batch?.revision }),
            });
            const json = await readResponse(response);
            if (!response.ok || !json.data) throw new Error(json.error ?? "No se pudo ejecutar la importación.");
            if (requestGeneration !== generation.current) return null;
            const results = Array.isArray(json.data) ? json.data as PurchaseCsvImportLineExecution[] : [];
            const refreshed = await apiFetch(`/api/purchases/imports/${encodeURIComponent(session.id)}?companyId=${encodeURIComponent(companyId)}`).then(readResponse);
            if (requestGeneration !== generation.current) return null;
            if (refreshed.data) commit(refreshed.data as PersistedBatch, requestGeneration);
            setSession((previous) => previous ? {
                ...previous,
                results: results.map((result: PurchaseCsvImportLineExecution & { sourceRow?: number }) => ({
                    purchaseKey: previous.purchases.find((purchase) => purchase.key === String(result.sourceRow))?.document ?? String(result.sourceRow ?? result.lineId ?? "Compra"),
                    status: result.status === "saved" || result.status === "confirmed" ? (result.status === "confirmed" ? "confirmed" : "saved") : "failed",
                    message: result.error,
                })),
            } : previous);
            return json.data;
        } catch (cause) {
            if (requestGeneration !== generation.current) return null;
            const message = cause instanceof Error ? cause.message : "No se pudo ejecutar la importación.";
            setError(message); return null;
        } finally { if (requestGeneration === generation.current) setLoading(false); }
    }, [batch?.revision, commit, session?.id]);

    const loadResumable = useCallback(async (companyId: string) => {
        const requestGeneration = generation.current;
        try {
            const response = await apiFetch(`/api/purchases/imports?companyId=${encodeURIComponent(companyId)}`);
            const json = await readResponse(response);
            if (requestGeneration !== generation.current) return;
            if (!response.ok) { setError(json.error ?? "No se pudieron cargar las importaciones pendientes."); return; }
            setResumable(Array.isArray(json.data) ? json.data as PersistedBatch[] : []);
        } catch (cause) {
            if (requestGeneration === generation.current) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las importaciones");
        }
    }, []);
    const resume = useCallback(async (companyId: string, id: string) => {
        const requestGeneration = generation.current;
        setLoading(true); setError(null);
        try { const response = await apiFetch(`/api/purchases/imports/${encodeURIComponent(id)}?companyId=${encodeURIComponent(companyId)}`); const json = await readResponse(response); if (!response.ok || !json.data) throw new Error(json.error ?? "No se pudo abrir la importación."); commit(json.data as PersistedBatch, requestGeneration); return json.data as PersistedBatch; }
        catch (cause) { if (requestGeneration === generation.current) setError(cause instanceof Error ? cause.message : "No se pudo abrir la importación."); return null; }
        finally { if (requestGeneration === generation.current) setLoading(false); }
    }, [commit]);

    const reset = useCallback(() => { generation.current += 1; setSession(null); setBatch(null); setResumable([]); setError(null); setLoading(false); }, []);
    return { session, batch, resumable, loading, error, submitFiles, updateSession, execute, loadResumable, resume, reset };
}
