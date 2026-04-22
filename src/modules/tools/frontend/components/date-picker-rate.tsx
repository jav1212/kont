"use client";

import { Calendar, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

interface Props {
    value: string | null;
    onChange: (date: string | null) => void;
    maxDate?: string;
}

export function DatePickerRate({ value, onChange, maxDate }: Props) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <label
                className={[
                    "group inline-flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-lg",
                    "border border-border-light bg-surface-1",
                    "hover:border-border-medium hover:bg-surface-2",
                    "focus-within:border-primary-500",
                    "transition-colors duration-150",
                    "cursor-pointer",
                ].join(" ")}
            >
                <Calendar size={13} className="text-foreground/50 group-focus-within:text-primary-500 transition-colors duration-150" />
                <input
                    type="date"
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value || null)}
                    max={maxDate}
                    className="bg-transparent text-[12px] font-mono tabular-nums text-foreground focus:outline-none [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
                    aria-label="Fecha de la tasa"
                />
                <ChevronDown
                    size={11}
                    aria-hidden
                    className="text-foreground/35 group-hover:text-foreground/60 transition-colors duration-150 shrink-0"
                />
            </label>
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
