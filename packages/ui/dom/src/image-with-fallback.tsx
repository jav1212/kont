import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";

export interface ImageWithFallbackProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  readonly src?: string | null | undefined;
  readonly fallback: ReactNode;
}

/** Prevents remote or expired media URLs from exposing the browser's broken-image UI. */
export function ImageWithFallback({ fallback, onError, src, ...props }: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) return fallback;
  return <img
    {...props}
    src={src}
    onError={(event) => {
      setFailed(true);
      onError?.(event);
    }}
  />;
}
