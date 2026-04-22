"use client";

import { AnimatePresence, motion } from "framer-motion";

interface Props {
    /** Display string — when it changes, crossfades in/out with a small translate. */
    value: string;
    className?: string;
    /** Optional key override when two identical strings should still be treated as distinct events. */
    animationKey?: string | number;
}

/**
 * Wraps a number/string in a Framer Motion AnimatePresence block.
 * When the value changes (key changes), the old span fades out while the new one
 * fades in with a gentle translate-y, producing a subtle crossfade that signals
 * "something recalculated" without drawing attention away from the result.
 *
 * Usage:
 *   <AnimatedNumber value={formatVes(converted, 2)} className="text-[32px] font-mono font-bold tabular-nums" />
 *
 * `popLayout` mode ensures the container width transitions smoothly as digits change,
 * avoiding jank on long-to-short changes (e.g. "1.234.567,89" → "42,10").
 */
export function AnimatedNumber({ value, className, animationKey }: Props) {
    const key = animationKey ?? value;

    return (
        <span className={["relative inline-block transition-[width] duration-150", className ?? ""].join(" ")}>
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                    key={key}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="inline-block"
                >
                    {value}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}
