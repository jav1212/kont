import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

export interface ImageWithFallbackProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src"
> {
  readonly alt: string;
  readonly src?: string | null | undefined;
  readonly fallback: ReactNode;
}

/**
 * Prevents remote or expired media URLs from exposing the browser's broken-image UI.
 *
 * @param props - Image attributes, source URL and fallback content.
 * @returns The requested image until it fails, then the supplied fallback.
 */
export function ImageWithFallback({
  alt,
  fallback,
  onError,
  src,
  ...props
}: ImageWithFallbackProps): ReactNode {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const failed = Boolean(src) && failedSource === src;

  if (!src || failed) return fallback;
  // A renderer-neutral DOM primitive cannot depend on Next.js Image.
  return (
    <img
      {...props}
      alt={alt}
      src={src}
      onError={(event) => {
        setFailedSource(src ?? null);
        onError?.(event);
      }}
    />
  );
}
