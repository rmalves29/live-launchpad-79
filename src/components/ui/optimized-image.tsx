import * as React from "react";
import { cn } from "@/lib/utils";
import { optimizedImageUrl } from "@/lib/image-utils";

type OptimizedImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "loading"> & {
  src: string | null | undefined;
  /** Largura alvo em px (default 400). */
  width?: number;
  /** Qualidade (default 70). */
  quality?: number;
  /** Modo lazy/eager (default lazy). */
  loading?: "lazy" | "eager";
};

/**
 * <img> que automaticamente serve a versão redimensionada do Supabase Storage.
 * Use para listagens, cards, miniaturas. Para zoom/detalhe use ZoomableImage
 * ou <img> com URL original.
 */
export const OptimizedImage = React.forwardRef<HTMLImageElement, OptimizedImageProps>(
  ({ src, width = 400, quality = 70, loading = "lazy", className, alt, ...rest }, ref) => {
    const optimized = optimizedImageUrl(src, { width, quality });
    return (
      <img
        ref={ref}
        src={optimized}
        alt={alt ?? ""}
        loading={loading}
        decoding="async"
        className={cn(className)}
        {...rest}
      />
    );
  }
);

OptimizedImage.displayName = "OptimizedImage";
