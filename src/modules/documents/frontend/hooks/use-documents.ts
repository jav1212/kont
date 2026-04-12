"use client";

import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/src/shared/frontend/utils/api-fetch';
import type { DocumentFolder } from '../../backend/domain/document-folder';
import type { Document } from '../../backend/domain/document';

export function useDocuments(companyId?: string | null) {
    const [folders,          setFolders]          = useState<DocumentFolder[]>([]);
    const [documents,        setDocuments]         = useState<Document[]>([]);
    const [selectedFolderId, setSelectedFolderId]  = useState<string | null>(null);
    const [loading,          setLoading]           = useState(false);
    const [error,            setError]             = useState<string | null>(null);

    // ── Fetch folders ──────────────────────────────────────────────────────
    const loadFolders = useCallback(async (parentId: string | null = null) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (parentId)  params.set('parentId', parentId);
            if (companyId) params.set('companyId', companyId);
            const res  = await apiFetch(`/api/documents/folders?${params}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Error al cargar carpetas');
            setFolders(json.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error desconocido');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    // ── Fetch documents in selected folder ────────────────────────────────
    const loadDocuments = useCallback(async (folderId: string | null = null) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (folderId)  params.set('folderId', folderId);
            if (companyId) params.set('companyId', companyId);
            const res  = await apiFetch(`/api/documents?${params}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Error al cargar documentos');
            setDocuments(json.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error desconocido');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { loadFolders(null); },            [loadFolders]);
    useEffect(() => { loadDocuments(selectedFolderId); }, [loadDocuments, selectedFolderId]);

    // ── Actions ───────────────────────────────────────────────────────────

    const selectFolder = useCallback((folderId: string | null) => {
        setSelectedFolderId(folderId);
    }, []);

    const createFolder = useCallback(async (name: string, parentId: string | null = null) => {
        const res  = await apiFetch('/api/documents/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parentId, companyId: companyId ?? null }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Error al crear carpeta');
        await loadFolders(parentId);
        return json.data as DocumentFolder;
    }, [companyId, loadFolders]);

    const renameFolder = useCallback(async (id: string, name: string) => {
        const res  = await apiFetch(`/api/documents/folders/${id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Error al renombrar carpeta');
        setFolders((prev) => prev.map((f) => f.id === id ? { ...f, name: json.data.name } : f));
        return json.data as DocumentFolder;
    }, []);

    const deleteFolder = useCallback(async (id: string) => {
        const res = await apiFetch(`/api/documents/folders/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const json = await res.json();
            throw new Error(json.error ?? 'Error al eliminar carpeta');
        }
        setFolders((prev) => prev.filter((f) => f.id !== id));
        if (selectedFolderId === id) {
            setSelectedFolderId(null);
            setDocuments([]);
        }
    }, [selectedFolderId]);

    const uploadDocument = useCallback(async (
        file: File,
        folderId: string | null = selectedFolderId,
        onProgress?: (pct: number) => void,
    ) => {
        // Step 1: get signed upload URL
        const urlRes  = await apiFetch('/api/documents/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, mimeType: file.type }),
        });
        const urlJson = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlJson.error ?? 'Error al obtener URL de subida');

        const { uploadUrl, storagePath } = urlJson.data;

        // Step 2: PUT file directly to Supabase Storage
        await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl);
            xhr.setRequestHeader('Content-Type', file.type);
            if (onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
                };
            }
            xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
            xhr.onerror = () => reject(new Error('Upload network error'));
            xhr.send(file);
        });

        // Step 3: register metadata in DB
        const regRes  = await apiFetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name:        file.name,
                storagePath,
                folderId:    folderId ?? null,
                companyId:   companyId ?? null,
                mimeType:    file.type || null,
                sizeBytes:   file.size,
            }),
        });
        const regJson = await regRes.json();
        if (!regRes.ok) throw new Error(regJson.error ?? 'Error al registrar documento');

        setDocuments((prev) => [regJson.data, ...prev]);
        return regJson.data as Document;
    }, [companyId, selectedFolderId]);

    const deleteDocument = useCallback(async (id: string) => {
        const res = await apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const json = await res.json();
            throw new Error(json.error ?? 'Error al eliminar documento');
        }
        setDocuments((prev) => prev.filter((d) => d.id !== id));
    }, []);

    const getDownloadUrl = useCallback(async (id: string): Promise<string> => {
        const res  = await apiFetch(`/api/documents/${id}/download-url`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Error al obtener URL de descarga');
        return json.data as string;
    }, []);

    const replicateFolders = useCallback(async (tenantIds: string[], folderIds?: string[]): Promise<{ tenantId: string; foldersCreated: number; foldersExisting: number; error?: string }[]> => {
        const res  = await apiFetch('/api/documents/folders/replicate', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ tenantIds, folderIds }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Error al replicar plantilla');
        return json.data.results;
    }, []);

    return {
        folders,
        documents,
        selectedFolderId,
        loading,
        error,
        selectFolder,
        createFolder,
        renameFolder,
        deleteFolder,
        uploadDocument,
        deleteDocument,
        getDownloadUrl,
        replicateFolders,
        reload: () => {
            loadFolders(null);
            loadDocuments(selectedFolderId);
        },
    };
}
