// ============================================================================
// Image Exporter — captures the calendar as PNG using html-to-image
// Forced to light mode for universal readability
// ============================================================================

import { toPng } from "html-to-image";

export interface ImageExportOptions {
    pixelRatio?: number;
    backgroundColor?: string;
    filename?: string;
}

/**
 * Exports a DOM node as a PNG by its ID.
 * Forces light mode on the node during capture via a temporary class.
 *
 * @param nodeId - The element ID to capture (e.g., "seniat-calendar-exportable")
 * @param filename - Download filename (without .png extension)
 * @param options - Optional overrides for pixel ratio and background color
 */
export async function exportAsPng(
    nodeId: string,
    filename: string,
    options: ImageExportOptions = {}
): Promise<void> {
    const node = document.getElementById(nodeId);
    if (!node) {
        throw new Error(`Element #${nodeId} not found`);
    }

    const {
        pixelRatio = 2,
        backgroundColor = "#FFFFFF",
    } = options;

    // Temporarily force light mode for the export
    node.classList.add("force-light");
    // Also temporarily remove dark class from html element scope if needed
    const htmlEl = document.documentElement;
    const hadDark = htmlEl.classList.contains("dark");

    try {
        const dataUrl = await toPng(node, {
            pixelRatio,
            backgroundColor,
            skipFonts: false,
            filter: (el) => {
                if (el instanceof HTMLElement && el.dataset.exportExclude === "true") {
                    return false;
                }
                return true;
            },
        });

        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${filename}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } finally {
        node.classList.remove("force-light");
        // Restore dark class if it was removed
        if (hadDark && !htmlEl.classList.contains("dark")) {
            htmlEl.classList.add("dark");
        }
    }
}
