"use client";

import { Calendar } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";

interface Props {
    value: string | null;
    onChange: (date: string | null) => void;
    maxDate?: string;
}

export function DatePickerRate({ value, onChange, maxDate }: Props) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <BaseInput.Field
                type="date"
                value={value ?? ""}
                onValueChange={(v) => onChange(v || null)}
                startContent={<Calendar size={14} className="text-[var(--text-tertiary)]" />}
                aria-label="Fecha de la tasa"
                max={maxDate}
            />
            <AnimatePresence initial={false}>
                {value && (
                    <motion.div
                        key="today-btn"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <BaseButton.Root
                            variant="ghost"
                            size="sm"
                            onClick={() => onChange(null)}
                        >
                            Hoy
                        </BaseButton.Root>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
