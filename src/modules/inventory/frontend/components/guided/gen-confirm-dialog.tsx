"use client";

import { Modal, ModalContent, ModalBody } from "@heroui/react";
import { Check, X, AlertTriangle } from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import type { RandomSalesPreviewLine } from "@/src/modules/inventory/frontend/hooks/use-inventory";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface GenConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    saving: boolean;
    period: string;
    reference: string;
    lines: RandomSalesPreviewLine[];
    sumSinIVA: number;
    sumIVA: number;
    sumConIVA: number;
}

function formatPeriodLabel(period: string): string {
    const [yearStr, monthStr] = period.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return period;
    const months = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];
    return `${months[month - 1]} ${year}`;
}

export function GenConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    saving,
    period,
    reference,
    lines,
    sumSinIVA,
    sumIVA,
    sumConIVA,
}: GenConfirmDialogProps) {
    const ventas = lines.filter((l) => l.tipo === "salida").length;
    const auto = lines.filter((l) => l.tipo === "autoconsumo").length;
    const shortfalls = lines.filter((l) => l.quantity > l.currentStock).length;

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => { if (!open && !saving) onClose(); }}
            placement="center"
            isDismissable={!saving}
            hideCloseButton
            classNames={{
                base: "rounded-2xl border border-border-light bg-surface-1 shadow-xl max-w-[520px] w-full mx-4",
                backdrop: "backdrop-blur-sm bg-black/40",
            }}
        >
            <ModalContent>
                <ModalBody className="p-0">
                    <div className="px-6 pt-6 pb-4 border-b border-border-light flex items-start justify-between gap-3">
                        <div>
                            <h3 className="font-mono text-[16px] font-bold uppercase tracking-[0.12em] text-foreground">
                                Confirmar operación
                            </h3>
                            <p className="font-mono text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                                Se crearán {lines.length} {lines.length === 1 ? "movimiento" : "movimientos"} de inventario en el período {formatPeriodLabel(period)}.
                                Esta acción quedará registrada y no se puede deshacer parcialmente.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            aria-label="Cerrar"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="px-6 py-5 space-y-3">
                        <SummaryRow label="Período" value={formatPeriodLabel(period)} />
                        <SummaryRow
                            label="Líneas"
                            value={`${lines.length} (${ventas} venta${ventas === 1 ? "" : "s"}${auto > 0 ? ` · ${auto} autoconsumo` : ""})`}
                        />
                        {reference.trim() && (
                            <SummaryRow label="Referencia" value={reference.trim()} />
                        )}

                        <div className="border-t border-border-light/60 pt-3 mt-3 space-y-3">
                            <SummaryRow label="Total S/IVA" value={`Bs ${fmtN(sumSinIVA)}`} />
                            <SummaryRow label="IVA" value={`Bs ${fmtN(sumIVA)}`} />
                            <SummaryRow
                                label="Total c/IVA"
                                value={`Bs ${fmtN(sumConIVA)}`}
                                emphasis
                            />
                        </div>

                        {shortfalls > 0 && (
                            <div className="mt-4 px-3.5 py-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] flex items-start gap-2.5">
                                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                <p className="font-mono text-[12px] text-amber-700 leading-relaxed">
                                    {shortfalls === 1
                                        ? "1 línea excede el stock disponible. Se permitirá guardar (quedará en stock negativo)."
                                        : `${shortfalls} líneas exceden el stock disponible. Se permitirá guardar (quedarán en stock negativo).`}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="px-6 py-4 border-t border-border-light bg-surface-2/40 flex items-center justify-end gap-3">
                        <BaseButton.Root
                            variant="secondary"
                            size="md"
                            onClick={onClose}
                            isDisabled={saving}
                        >
                            Cancelar
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="primary"
                            size="md"
                            onClick={onConfirm}
                            loading={saving}
                            leftIcon={<Check size={16} />}
                        >
                            Confirmar
                        </BaseButton.Root>
                    </div>
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}

function SummaryRow({
    label, value, emphasis,
}: {
    label: string;
    value: string;
    emphasis?: boolean;
}) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                {label}
            </span>
            <span
                className={[
                    "font-mono tabular-nums text-right",
                    emphasis ? "text-[15px] font-bold text-foreground" : "text-[13px] text-foreground",
                ].join(" ")}
            >
                {value}
            </span>
        </div>
    );
}
