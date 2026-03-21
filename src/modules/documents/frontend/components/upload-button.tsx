"use client";

import { useRef, useState } from 'react';

interface UploadProgress {
    file:     string;
    percent:  number;
    done:     boolean;
    error?:   string;
}

interface UploadButtonProps {
    onUpload: (file: File, onProgress: (pct: number) => void) => Promise<void>;
    disabled?: boolean;
}

export function UploadButton({ onUpload, disabled }: UploadButtonProps) {
    const inputRef  = useRef<HTMLInputElement>(null);
    const [progress, setProgress] = useState<UploadProgress[]>([]);
    const [uploading, setUploading] = useState(false);

    async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        if (files.length === 0) return;

        setUploading(true);
        setProgress(files.map((f) => ({ file: f.name, percent: 0, done: false })));

        await Promise.all(
            files.map(async (file, i) => {
                try {
                    await onUpload(file, (pct) => {
                        setProgress((prev) =>
                            prev.map((p, idx) => (idx === i ? { ...p, percent: pct } : p))
                        );
                    });
                    setProgress((prev) =>
                        prev.map((p, idx) => (idx === i ? { ...p, percent: 100, done: true } : p))
                    );
                } catch (err) {
                    setProgress((prev) =>
                        prev.map((p, idx) =>
                            idx === i ? { ...p, error: err instanceof Error ? err.message : 'Error' } : p
                        )
                    );
                }
            })
        );

        setUploading(false);
        // Clear after a short delay
        setTimeout(() => {
            setProgress([]);
            if (inputRef.current) inputRef.current.value = '';
        }, 2500);
    }

    return (
        <div>
            <input
                ref={inputRef}
                type="file"
                multiple
                className="sr-only"
                aria-label="Seleccionar archivos para subir"
                onChange={handleChange}
                disabled={disabled || uploading}
            />

            <button
                onClick={() => inputRef.current?.click()}
                disabled={disabled || uploading}
                className="min-h-[44px] flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-mono text-[11px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Subir archivos"
            >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6.5 9V1M3 4l3.5-3.5L10 4" />
                    <path d="M1 12h11" />
                </svg>
                {uploading ? 'Subiendo…' : 'Subir archivos'}
            </button>

            {/* Progress list */}
            {progress.length > 0 && (
                <ul className="mt-2 space-y-1.5" role="status" aria-live="polite" aria-label="Progreso de subida">
                    {progress.map((p, i) => (
                        <li key={i} className="flex flex-col gap-0.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[10px] text-foreground/60 truncate max-w-[160px]">
                                    {p.file}
                                </span>
                                <span className="font-mono text-[10px] text-foreground/40 flex-shrink-0">
                                    {p.error ? '✗' : p.done ? '✓' : `${p.percent}%`}
                                </span>
                            </div>
                            <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                        p.error ? 'bg-red-500' : p.done ? 'bg-primary-500' : 'bg-primary-500/60'
                                    }`}
                                    style={{ width: `${p.error ? 100 : p.percent}%` }}
                                />
                            </div>
                            {p.error && (
                                <p className="font-mono text-[10px] text-red-500">{p.error}</p>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
