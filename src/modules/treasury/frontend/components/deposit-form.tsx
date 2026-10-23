"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TreasuryEligibleCollectionRow } from "../treasury-rows";
import { addDecimal, exactDecimal } from "@kontave/monetary/domain";
import { useTreasuryContext } from "../context/treasury-context";
import { useTreasuryCatalogs } from "../hooks/use-treasury-catalogs";
import { useTreasuryCommand } from "../hooks/use-treasury-command";
import { TreasuryInput, TreasurySelect, treasuryAccountLabel, treasuryErrorMessage, treasuryToday } from "./treasury-form-controls";

type Mode = "cash" | "collections";
const COLLECTION_PAGE_SIZE = 100;

/** Registers a bank deposit either from a cash box (TES-021) or by grouping eligible sale collections (TES-022).
 *
 * Collections are only reserved by Treasury; Sales keeps ownership of the receivable. Each selected
 * collection is allocated for its full available amount, and the deposit amount is their exact sum.
 * Selections survive pagination so a deposit may group collections listed on different pages.
 *
 * @param props - Close callback invoked after a committed deposit or on cancel.
 * @returns The deposit creation panel.
 */
export function DepositForm({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const { query, revision } = useTreasuryContext();
  const catalogs = useTreasuryCatalogs();
  const command = useTreasuryCommand();
  const resetCommand = command.reset;
  const [mode, setMode] = useState<Mode>("cash");
  const [destinationId, setDestinationId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(treasuryToday);
  const [reference, setReference] = useState("");
  const [collections, setCollections] = useState<readonly TreasuryEligibleCollectionRow[]>([]);
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionPage, setCollectionPage] = useState(1);
  const [selected, setSelected] = useState<ReadonlyMap<string, TreasuryEligibleCollectionRow>>(new Map());
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = catalogs.accounts.find((item) => item.id === destinationId && item.rowKind === "bank_account");
  const source = catalogs.accounts.find((item) => item.id === sourceId && item.rowKind === "cash_box");
  const destinations = catalogs.accounts.filter((item) => item.rowKind === "bank_account" && item.status === "active");
  const sources = catalogs.accounts.filter((item) => item.rowKind === "cash_box" && item.status === "active" && (!destination || item.currency === destination.currency));

  // Changing the destination currency invalidates every reservation and the cash source.
  useEffect(() => { setSelected(new Map()); setCollectionPage(1); setSourceId(""); resetCommand(); }, [destination?.currency, resetCommand]);

  const loadCollections = useCallback(async () => {
    if (mode !== "collections" || !destination) { setCollections([]); setCollectionTotal(0); return; }
    setLoadingCollections(true); setError(null);
    try {
      const result = await query<TreasuryEligibleCollectionRow>({ kind: "list_eligible_collections", currency: destination.currency, page: collectionPage, pageSize: COLLECTION_PAGE_SIZE });
      setCollections(result.items); setCollectionTotal(result.total);
    } catch (cause: unknown) { setError(treasuryErrorMessage(cause, "No se pudieron consultar las cobranzas disponibles.")); }
    finally { setLoadingCollections(false); }
  }, [collectionPage, destination, mode, query]);
  useEffect(() => { void loadCollections(); }, [loadCollections, revision]);

  const groupedAmount = useMemo(() => [...selected.values()].reduce((sum, item) => addDecimal(sum, exactDecimal(item.availableAmount)), exactDecimal("0")), [selected]);
  const toggle = (item: TreasuryEligibleCollectionRow) => setSelected((current) => {
    const next = new Map(current);
    if (next.has(item.collectionId)) next.delete(item.collectionId); else next.set(item.collectionId, item);
    return next;
  });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      if (!destination) throw new Error("Selecciona la cuenta bancaria de destino.");
      if (mode === "cash" && (!source || source.currency !== destination.currency)) throw new Error("Selecciona una caja de origen en la moneda de la cuenta de destino.");
      if (mode === "collections" && selected.size === 0) throw new Error("Selecciona al menos una cobranza.");
      const allocations = [...selected.values()];
      await command.execute((identity, depositId) => ({
        ...identity,
        kind: "create_deposit",
        depositId,
        destinationBankAccountId: destination.id,
        ...(mode === "cash" && source
          ? { sourceAccount: { kind: "cash_box" as const, id: source.id, currency: source.currency }, expectedSourceVersion: source.version }
          : { collectionAllocations: allocations.map((item) => ({ collectionId: item.collectionId, amount: { amount: item.availableAmount, currency: item.currency } })) }),
        money: { amount: mode === "cash" ? amount : groupedAmount, currency: destination.currency },
        depositDate: date,
        reference: reference.trim(),
        expectedDestinationVersion: destination.version,
      }), `deposit:${mode}:${destination.id}`);
      onClose();
    } catch (cause: unknown) {
      setError(treasuryErrorMessage(cause, "No se pudo registrar el depósito."));
      // A definitive rejection (e.g. another deposit reserved a collection) voids the selection; a lost
      // response keeps it so the retry replays the same deposit.
      const code = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : "";
      if (mode === "collections" && code.startsWith("TREASURY_") && code !== "TREASURY_UNAVAILABLE") { setSelected(new Map()); void loadCollections(); }
    }
  };

  return <section className="rounded-xl border border-primary-200 bg-content1 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Nuevo depósito</h2>
      <div role="radiogroup" aria-label="Origen del depósito" className="flex gap-2 text-sm">{([["cash", "Desde caja"], ["collections", "Agrupar cobranzas"]] as const).map(([value, text]) => <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => { setMode(value); setSelected(new Map()); command.reset(); }} className={`rounded-lg border px-3 py-2 ${mode === value ? "border-primary bg-primary-50 text-primary" : "border-default-300"}`}>{text}</button>)}</div>
    </div>
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <TreasurySelect label="Cuenta de destino" value={destinationId} onChange={setDestinationId} optional emptyLabel="Selecciona" options={destinations.map((item) => [item.id, treasuryAccountLabel(item)])} />
      {mode === "cash" && <>
        <TreasurySelect label="Caja de origen" value={sourceId} onChange={setSourceId} optional emptyLabel="Selecciona" options={sources.map((item) => [item.id, treasuryAccountLabel(item)])} />
        <TreasuryInput label="Monto" type="number" min="0" step="0.01" value={amount} onChange={setAmount} />
      </>}
      {mode === "collections" && <p className="self-end text-sm">Total agrupado: <span className="font-semibold">{groupedAmount} {destination?.currency ?? ""}</span> · {selected.size} cobranzas</p>}
      <TreasuryInput label="Fecha" type="date" value={date} onChange={setDate} />
      <TreasuryInput label="Referencia bancaria" value={reference} onChange={setReference} />
      {mode === "collections" && <fieldset className="space-y-2 rounded-lg border border-default-200 p-3 text-sm sm:col-span-2 lg:col-span-3">
        <legend className="px-1">Cobranzas disponibles{destination ? ` en ${destination.currency}` : ""}</legend>
        {!destination ? <p className="text-default-500">Selecciona la cuenta de destino para ver las cobranzas de su moneda.</p>
          : loadingCollections ? <p>Cargando…</p>
          : collections.length === 0 ? <p className="text-default-500">No hay cobranzas disponibles en esta moneda.</p>
          : <ul className="max-h-64 divide-y divide-default-100 overflow-y-auto">{collections.map((item) => <li key={item.collectionId}><label className="flex items-start gap-2 py-2"><input type="checkbox" checked={selected.has(item.collectionId)} onChange={() => toggle(item)} className="mt-1" /><span><span className="block">{item.availableAmount} {item.currency} · {item.receivedAt.slice(0, 10)}</span><span className="text-xs text-default-500">Cobro {item.collectionId}{exactDecimal(item.reservedAmount) !== exactDecimal("0") ? ` · reservado ${item.reservedAmount} de ${item.receivedAmount}` : ""}</span></span></label></li>)}</ul>}
        {destination && collectionTotal > COLLECTION_PAGE_SIZE && <div className="flex items-center justify-between pt-2"><button type="button" disabled={collectionPage === 1 || loadingCollections} onClick={() => setCollectionPage((page) => page - 1)} className="disabled:opacity-50">Anterior</button><span>Página {collectionPage} · {collectionTotal} cobranzas</span><button type="button" disabled={collectionPage * COLLECTION_PAGE_SIZE >= collectionTotal || loadingCollections} onClick={() => setCollectionPage((page) => page + 1)} className="disabled:opacity-50">Siguiente</button></div>}
      </fieldset>}
      {error && <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger sm:col-span-2 lg:col-span-3">{error}</p>}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <button type="submit" disabled={command.pending || !destination || (mode === "collections" && selected.size === 0)} className="rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50">{command.pending ? "Guardando…" : "Registrar depósito"}</button>
        <button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button>
      </div>
    </form>
  </section>;
}
