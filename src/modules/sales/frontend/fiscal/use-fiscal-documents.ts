"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import type { FiscalDocumentDto, FiscalDocumentListItem, FiscalEventDto } from "./fiscal-document-types";

interface Cursor {
  readonly createdAt: string;
  readonly id: string;
}

interface Metadata {
  readonly revision: number;
  readonly source: { readonly kind: string; readonly id: string };
  readonly canRevise: boolean;
}

/**
 * Loads an inbox within the selected company and discards obsolete responses.
 * @param companyId - Company whose fiscal documents may be displayed.
 * @returns Paged documents, loading/error state, and retry actions.
 * @throws No expected errors; request failures become visible error state.
 */
export function useFiscalDocuments(companyId: string | null) {
  const [items, setItems] = useState<FiscalDocumentListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<Cursor | null>(null);
  const [loadedCompany, setLoadedCompany] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);

  const load = useCallback(async (cursor: Cursor | null = null) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setError(null);
    if (!cursor) {
      setItems([]);
      setNextCursor(null);
    }
    setLoadedCompany(companyId);
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({ companyId, limit: "30" });
      if (cursor) {
        query.set("cursorCreatedAt", cursor.createdAt);
        query.set("cursorId", cursor.id);
      }
      const response = await apiFetch("/api/fiscal/documents?" + query, { signal: controller.signal });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "No se pudo consultar la bandeja fiscal.");
      if (controller.signal.aborted) return;
      setItems((previous) => cursor ? [...previous, ...(json.data ?? [])] : (json.data ?? []));
      setNextCursor(json.nextCursor ?? null);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Error de red.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
    return () => active.current?.abort();
  }, [load]);

  // Hide the previous company's data during the render before effect cleanup.
  const inScope = loadedCompany === companyId;
  return {
    items: inScope ? items : [],
    nextCursor: inScope ? nextCursor : null,
    loading: !inScope || loading,
    error: inScope ? error : null,
    reload: () => load(),
    loadMore: () => nextCursor && !loading ? load(nextCursor) : Promise.resolve(),
  };
}

/**
 * Loads a fiscal snapshot and its independently paginated immutable history.
 * @param companyId - Company authorized for the requested document.
 * @param documentId - Stable fiscal document identifier.
 * @returns Detail, audit cursors, errors, and actions that abort obsolete requests.
 * @throws No expected errors; request failures become visible error state.
 */
export function useFiscalDocument(companyId: string | null, documentId: string) {
  const [document, setDocument] = useState<FiscalDocumentDto | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [events, setEvents] = useState<FiscalEventDto[]>([]);
  const [nextEventCursor, setNextEventCursor] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [loadedScope, setLoadedScope] = useState("");
  const detailRequest = useRef<AbortController | null>(null);
  const eventRequest = useRef<AbortController | null>(null);
  const scope = JSON.stringify([companyId, documentId]);

  const loadEvents = useCallback(async (cursor: Cursor | null = null) => {
    eventRequest.current?.abort();
    const controller = new AbortController();
    eventRequest.current = controller;
    setEventsError(null);
    if (!companyId || !documentId) return;
    setEventsLoading(true);
    try {
      const query = new URLSearchParams({ companyId, limit: "50" });
      if (cursor) {
        query.set("cursorRecordedAt", cursor.createdAt);
        query.set("cursorId", cursor.id);
      }
      const response = await apiFetch("/api/fiscal/documents/" + encodeURIComponent(documentId) + "/events?" + query, { signal: controller.signal });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "No se pudo consultar el historial.");
      if (controller.signal.aborted) return;
      setEvents((previous) => cursor ? [...previous, ...(json.data ?? [])] : (json.data ?? []));
      setNextEventCursor(json.nextCursor ?? null);
    } catch (cause) {
      if (!controller.signal.aborted) setEventsError(cause instanceof Error ? cause.message : "Error de red al consultar el historial.");
    } finally {
      if (!controller.signal.aborted) setEventsLoading(false);
    }
  }, [companyId, documentId]);

  const load = useCallback(async () => {
    detailRequest.current?.abort();
    eventRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDocument(null);
    setMetadata(null);
    setEvents([]);
    setNextEventCursor(null);
    setError(null);
    setEventsError(null);
    setEventsLoading(false);
    setLoadedScope(scope);
    if (!companyId || !documentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({ companyId });
      const response = await apiFetch("/api/fiscal/documents/" + encodeURIComponent(documentId) + "?" + query, { signal: controller.signal });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "No se pudo consultar el documento.");
      if (controller.signal.aborted) return;
      setDocument(json.data);
      setMetadata(json.metadata);
      void loadEvents();
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Error de red.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [companyId, documentId, loadEvents, scope]);

  useEffect(() => {
    void load();
    return () => {
      detailRequest.current?.abort();
      eventRequest.current?.abort();
    };
  }, [load]);

  const inScope = loadedScope === scope;
  return {
    document: inScope ? document : null,
    metadata: inScope ? metadata : null,
    events: inScope ? events : [],
    nextEventCursor: inScope ? nextEventCursor : null,
    loading: !inScope || loading,
    eventsLoading,
    error: inScope ? error : null,
    eventsError: inScope ? eventsError : null,
    reload: load,
    reloadEvents: () => loadEvents(),
    loadMoreEvents: () => nextEventCursor && !eventsLoading ? loadEvents(nextEventCursor) : Promise.resolve(),
  };
}
