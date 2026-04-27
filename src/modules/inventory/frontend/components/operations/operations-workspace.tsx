"use client";

// OperationsWorkspace — top-level surface for `/inventory/operations/new`.
// Starts in the "step 0" selector and transitions to OperationForm once the
// user picks a kind. Supports `?op=adjustment|return|self-consumption` deep
// linking (used by the redirects from the legacy URLs).

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { OperationForm } from "./operation-form";
import { OperationKindSelector } from "./operation-kind-selector";
import type { OperationKind } from "./operation-types";

const VALID_KINDS: OperationKind[] = ["adjustment", "return", "self-consumption"];

function parseKindFromQuery(value: string | null): OperationKind | null {
    if (!value) return null;
    return (VALID_KINDS as string[]).includes(value) ? (value as OperationKind) : null;
}

export function OperationsWorkspace() {
    const searchParams = useSearchParams();
    const initialKind = parseKindFromQuery(searchParams.get("op"));
    const [selectedKind, setSelectedKind] = useState<OperationKind | null>(initialKind);

    function handleChangeKind() {
        const ok = confirm("¿Cambiar tipo de operación? Los datos del formulario se perderán.");
        if (ok) setSelectedKind(null);
    }

    if (!selectedKind) {
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <OperationKindSelector onSelect={setSelectedKind} />
            </div>
        );
    }

    return (
        <OperationForm
            key={selectedKind}
            op={selectedKind}
            onChangeKind={handleChangeKind}
        />
    );
}
