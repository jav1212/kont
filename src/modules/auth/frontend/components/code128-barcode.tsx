"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/**
 * Renders a scanner-readable Code 128 SVG locally in the browser.
 *
 * @param props - The initial-only credential to encode.
 * @returns An accessible SVG barcode without transmitting its credential.
 */
export function Code128Barcode({ value }: { value: string }) {
    const reference = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!reference.current) return;
        JsBarcode(reference.current, value, {
            format: "CODE128",
            displayValue: false,
            height: 88,
            width: 2,
            margin: 10,
            background: "#ffffff",
            lineColor: "#000000",
        });
    }, [value]);

    return <svg ref={reference} role="img" aria-label="Código de barras Code 128" className="mx-auto h-auto max-w-full" />;
}
