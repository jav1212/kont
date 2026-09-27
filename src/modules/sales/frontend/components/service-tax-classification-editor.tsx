"use client";

import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BaseSelect } from "@/src/shared/frontend/components/base-select";
import { BaseTextarea } from "@/src/shared/frontend/components/base-textarea";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";

type ServiceTaxTreatment = "taxed" | "exempt" | "exonerated" | "not_subject";

interface ServiceTaxAssignment {
    readonly taxCode: string;
    readonly treatment: ServiceTaxTreatment;
    readonly effectiveFrom: string;
    readonly effectiveTo: string | null;
    readonly legalBasis: string;
}

interface ServiceTaxProfile {
    readonly serviceCode: string;
    readonly unitCode: string;
    readonly jurisdiction: string;
    readonly version: number;
    readonly assignments: readonly ServiceTaxAssignment[];
}

interface ClassificationFormValue {
    serviceCode: string;
    unitCode: string;
    jurisdiction: string;
    treatment: ServiceTaxTreatment | "";
    effectiveFrom: string;
    legalBasis: string;
    expectedVersion: number;
}

/** Props for the company-scoped service fiscal classification editor. */
export interface ServiceTaxClassificationEditorProps {
    /** Company that owns the service classification. */
    readonly companyId: string;
    /** Current code stored on the service line. */
    readonly serviceCode: string;
    /** Whether the editor is visible. */
    readonly isOpen: boolean;
    /** Closes the editor without changing the invoice line. */
    readonly onClose: () => void;
    /** Stores the configured code in the invoice line after a successful save. */
    readonly onServiceCodeSaved: (serviceCode: string) => void;
}

const TREATMENT_OPTIONS = [
    { id: "taxed", name: "Gravado" },
    { id: "exempt", name: "Exento" },
    { id: "exonerated", name: "Exonerado" },
    { id: "not_subject", name: "No sujeto" },
] as const;

function emptyForm(serviceCode: string): ClassificationFormValue {
    return {
        serviceCode,
        unitCode: "",
        jurisdiction: "",
        treatment: "",
        effectiveFrom: "",
        legalBasis: "",
        expectedVersion: 0,
    };
}

function currentIvaAssignment(profile: ServiceTaxProfile): ServiceTaxAssignment | undefined {
    return profile.assignments.find((assignment) => assignment.taxCode === "IVA" && assignment.effectiveTo === null)
        ?? profile.assignments.find((assignment) => assignment.taxCode === "IVA");
}

/**
 * Edits the versioned IVA treatment for one service code without assuming legal data.
 * @param props - Authorized company, source code, visibility, and callbacks.
 * @returns The compact classification dialog.
 */
export function ServiceTaxClassificationEditor({
    companyId,
    serviceCode,
    isOpen,
    onClose,
    onServiceCodeSaved,
}: ServiceTaxClassificationEditorProps) {
    const requestId = useRef(0);
    const [value, setValue] = useState<ClassificationFormValue>(() => emptyForm(serviceCode));
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);
    const [profileLoaded, setProfileLoaded] = useState(false);

    async function loadProfile(code = serviceCode): Promise<void> {
        const normalizedCode = code.trim();
        const currentRequest = ++requestId.current;
        setError(null);
        setConflict(false);
        setProfileLoaded(false);
        setValue(emptyForm(normalizedCode));
        if (!companyId || !normalizedCode) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ companyId, serviceCode: normalizedCode });
            const response = await apiFetch(`/api/fiscal/service-taxonomy?${params.toString()}`);
            const payload = await response.json();
            if (currentRequest !== requestId.current) return;
            if (response.status === 404) return;
            if (!response.ok) {
                setError(payload.error ?? "No fue posible consultar la clasificación fiscal.");
                return;
            }
            const profile = payload.data as ServiceTaxProfile;
            const assignment = currentIvaAssignment(profile);
            setProfileLoaded(true);
            setValue({
                serviceCode: profile.serviceCode,
                unitCode: profile.unitCode,
                jurisdiction: profile.jurisdiction,
                treatment: assignment?.treatment ?? "",
                effectiveFrom: assignment?.effectiveFrom ?? "",
                legalBasis: assignment?.legalBasis ?? "",
                expectedVersion: profile.version,
            });
        } catch {
            if (currentRequest === requestId.current) setError("No fue posible consultar la clasificación fiscal.");
        } finally {
            if (currentRequest === requestId.current) setLoading(false);
        }
    }

    useEffect(() => {
        if (isOpen) {
            setSaving(false);
            void loadProfile(serviceCode);
        }
        else requestId.current += 1;
        // The request must restart when the selected company or line code changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, companyId, serviceCode]);

    const canSave = Boolean(
        companyId
        && value.serviceCode.trim()
        && value.unitCode.trim()
        && value.jurisdiction.trim()
        && value.treatment
        && value.effectiveFrom
        && value.legalBasis.trim(),
    );

    async function save(): Promise<void> {
        if (!canSave || !value.treatment) return;
        const currentRequest = ++requestId.current;
        setSaving(true);
        setError(null);
        setConflict(false);
        try {
            const response = await apiFetch("/api/fiscal/service-taxonomy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    companyId,
                    serviceCode: value.serviceCode.trim(),
                    unitCode: value.unitCode.trim(),
                    jurisdiction: value.jurisdiction.trim().toUpperCase(),
                    taxCode: "IVA",
                    treatment: value.treatment,
                    effectiveFrom: value.effectiveFrom,
                    legalBasis: value.legalBasis.trim(),
                    expectedVersion: value.expectedVersion,
                }),
            });
            const payload = await response.json();
            if (currentRequest !== requestId.current) return;
            if (!response.ok) {
                setConflict(response.status === 409);
                setError(payload.error ?? "No fue posible guardar la clasificación fiscal.");
                return;
            }
            const saved = payload.data as ServiceTaxProfile;
            onServiceCodeSaved(saved.serviceCode);
            onClose();
        } catch {
            if (currentRequest === requestId.current) setError("No fue posible guardar la clasificación fiscal.");
        } finally {
            if (currentRequest === requestId.current) setSaving(false);
        }
    }

    return (
        <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose(); }} size="2xl">
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    <span>Clasificación fiscal del servicio</span>
                    <span className="text-[12px] font-normal text-[var(--text-tertiary)]">Registra datos vigentes y su fundamento; esto prepara un borrador, no emite una factura fiscal.</span>
                </ModalHeader>
                <ModalBody className="pb-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <BaseInput.Field label="Código de servicio" value={value.serviceCode} onValueChange={(serviceCode) => setValue((current) => ({ ...current, serviceCode }))} isRequired isDisabled={loading || saving || profileLoaded} description={profileLoaded ? "El código de una clasificación existente no se puede renombrar. Cambia el código en la línea y vuelve a consultar." : undefined} />
                        <BaseInput.Field label="Unidad fiscal" value={value.unitCode} onValueChange={(unitCode) => setValue((current) => ({ ...current, unitCode }))} placeholder="Ej. UND, HORA" isRequired isDisabled={loading || saving} />
                        <BaseInput.Field label="Jurisdicción" value={value.jurisdiction} onValueChange={(jurisdiction) => setValue((current) => ({ ...current, jurisdiction }))} placeholder="Ej. VE" isRequired isDisabled={loading || saving} />
                        <BaseSelect label="Tratamiento IVA" items={[...TREATMENT_OPTIONS]} value={value.treatment} onValueChange={(treatment) => setValue((current) => ({ ...current, treatment: treatment as ServiceTaxTreatment }))} selectionMode="single" isRequired isDisabled={loading || saving} />
                        <BaseInput.Field label="Vigente desde" type="date" value={value.effectiveFrom} onValueChange={(effectiveFrom) => setValue((current) => ({ ...current, effectiveFrom }))} isRequired isDisabled={loading || saving} />
                    </div>
                    <BaseTextarea label="Fundamento legal" value={value.legalBasis} onChange={(event) => setValue((current) => ({ ...current, legalBasis: event.target.value }))} placeholder="Indica la norma, artículo o acto que sustenta el tratamiento." required disabled={loading || saving} />
                    {loading && <p className="text-[12px] text-[var(--text-tertiary)]">Consultando clasificación existente…</p>}
                    {error && <div role="alert" className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-[12px] text-error">{error}</div>}
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                        {!profileLoaded && <BaseButton.Root variant="secondary" size="md" onClick={() => void loadProfile(value.serviceCode)} disabled={saving || loading || !value.serviceCode.trim()}>Consultar código</BaseButton.Root>}
                        {conflict && <BaseButton.Root variant="secondary" size="md" onClick={() => void loadProfile(value.serviceCode)} disabled={saving}>Recargar versión</BaseButton.Root>}
                        <BaseButton.Root variant="secondary" size="md" onClick={onClose} disabled={saving}>Cancelar</BaseButton.Root>
                        <BaseButton.Root variant="primary" size="md" onClick={() => void save()} disabled={!canSave || loading || saving}>{saving ? "Guardando…" : "Guardar clasificación"}</BaseButton.Root>
                    </div>
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
