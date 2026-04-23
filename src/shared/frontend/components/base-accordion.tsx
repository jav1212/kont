"use client";

import React from "react";
import {
    Accordion,
    AccordionItem,
    AccordionProps,
    AccordionItemProps,
} from "@heroui/react";

// ============================================================================
// TYPES
//
// AccordionItemInput  — what YOU pass to accordionItemProps()  (title: string)
// AccordionItemProps  — what HeroUI AccordionItem accepts       (title: ReactNode)
//
// Keeping them separate eliminates the type mismatch.
// ============================================================================

export interface AccordionItemInput
    extends Omit<AccordionItemProps, "title" | "subtitle"> {
    title:     string;
    subtitle?: string;
}

// ============================================================================
// CHEVRON ICON
// ============================================================================

const ChevronIcon = () => (
    <svg
        width="12" height="12" viewBox="0 0 12 12"
        fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round"
        className="text-neutral-400 flex-shrink-0"
    >
        <path d="M2 4.5L6 8L10 4.5" />
    </svg>
);

// ============================================================================
// ITEM CLASSNAMES FACTORY
// ============================================================================

const itemClassNames = (classNames?: AccordionItemProps["classNames"]) => ({
    base: [
        "bg-surface-1",
        "border border-border-light",
        "rounded-xl overflow-hidden",
        "shadow-[0_1px_2px_rgba(0,0,0,.04)]",
        "transition-colors duration-150",
        "data-[open=true]:border-border-medium",
        classNames?.base ?? "",
    ].join(" "),
    heading:      ["px-4", classNames?.heading ?? ""].join(" "),
    trigger:      ["py-3 gap-3", "hover:bg-surface-2 transition-colors duration-150", classNames?.trigger ?? ""].join(" "),
    titleWrapper: "flex flex-col gap-0",
    content:      ["px-4 pb-4 pt-3", "border-t border-border-light", "bg-neutral-50/30 dark:bg-neutral-900/20", classNames?.content ?? ""].join(" "),
    indicator:    ["text-neutral-400", "transition-transform duration-150", classNames?.indicator ?? ""].join(" "),
});

// ============================================================================
// COMPONENT
// ============================================================================

export abstract class BaseAccordion {

    static Root = ({ children, className = "", ...props }: AccordionProps) => (
        <Accordion
            variant="splitted"
            selectionMode="multiple"
            showDivider={false}
            className={["flex flex-col gap-2 px-0", className].join(" ")}
            {...props}
        >
            {children}
        </Accordion>
    );

    // Typed as typeof AccordionItem — HeroUI collection can identify it,
    // and it accepts AccordionItemProps (title: ReactNode) without conflict.
    static Item = AccordionItem;
}

// ============================================================================
// FACTORY FUNCTION
//
// Converts AccordionItemInput (title: string) → AccordionItemProps (title: ReactNode)
// Spread the result onto <BaseAccordion.Item>, and pass `key` directly as a JSX
// attribute (React forbids `key` in spread props):
//
//   <BaseAccordion.Item key="a" {...accordionItemProps({ title: "Section" })}>
//     ...
//   </BaseAccordion.Item>
// ============================================================================

export function accordionItemProps({
    title,
    subtitle,
    classNames,
    // Absorb `key` if callers accidentally pass it — it must live on JSX, not in spread props.
    key: _key,
    ...rest
}: AccordionItemInput & { key?: React.Key }): Omit<AccordionItemProps, "key"> {
    void _key;
    return {
        indicator: <ChevronIcon />,
        classNames: itemClassNames(classNames),
        title: (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                {title}
            </span>
        ),
        subtitle: subtitle ? (
            <span className="font-mono text-[11px] text-neutral-400 mt-0.5 block">
                {subtitle}
            </span>
        ) : undefined,
        ...rest,
    };
}