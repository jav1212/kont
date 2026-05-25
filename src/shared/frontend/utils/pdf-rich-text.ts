import type jsPDF from "jspdf";
import type { RGB } from "./pdf-chrome";

export interface RichSegment {
    text: string;
    bold?: boolean;
}

interface TaggedWord {
    word: string;
    bold: boolean;
}

export function renderRichParagraph(
    doc: jsPDF,
    segments: RichSegment[],
    x: number,
    y: number,
    maxWidth: number,
    fontSize: number,
    lineHeight: number,
    color: RGB,
): number {
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);

    const scale = doc.internal.scaleFactor;

    const measure = (text: string, bold: boolean): number => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        return (doc.getStringUnitWidth(text) * fontSize) / scale;
    };

    const words: TaggedWord[] = [];
    for (const seg of segments) {
        const bold = !!seg.bold;
        const parts = seg.text.split(/(\s+)/);
        for (const p of parts) {
            if (p.length > 0 && p.trim().length > 0) {
                words.push({ word: p, bold });
            }
        }
    }

    if (words.length === 0) return y;

    const spaceW = measure(" ", false);

    let lineWords: TaggedWord[] = [];
    let lineW = 0;
    let curY = y;

    const flushLine = () => {
        let cx = x;
        for (let i = 0; i < lineWords.length; i++) {
            const tw = lineWords[i]!;
            doc.setFont("helvetica", tw.bold ? "bold" : "normal");
            doc.setFontSize(fontSize);
            doc.setTextColor(color[0], color[1], color[2]);
            doc.text(tw.word, cx, curY);
            cx += measure(tw.word, tw.bold);
            if (i < lineWords.length - 1) cx += spaceW;
        }
        curY += lineHeight;
        lineWords = [];
        lineW = 0;
    };

    for (const tw of words) {
        const ww = measure(tw.word, tw.bold);
        const needed = lineWords.length === 0 ? ww : spaceW + ww;

        if (lineW + needed > maxWidth && lineWords.length > 0) {
            flushLine();
        }

        if (lineWords.length > 0) lineW += spaceW;
        lineWords.push(tw);
        lineW += measure(tw.word, tw.bold);
    }

    if (lineWords.length > 0) flushLine();

    return curY;
}
