import * as React from "react";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ZoomIn } from "lucide-react";

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  fallback?: React.ReactNode;
}

export const ZoomableImage = ({
  src,
  alt,
  className,
  containerClassName,
  fallback
}: ZoomableImageProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [lensPosition, setLensPosition] = useState({ x: 0, y: 0 });
  const [backgroundPosition, setBackgroundPosition] = useState("center");
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setLensPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setBackgroundPosition(`${x}% ${y}%`);
  };

  if (!src) {
    return fallback || (
      <div className={cn("bg-muted rounded flex items-center justify-center text-xs text-muted-foreground", containerClassName)}>
        Sem foto
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-hidden cursor-zoom-in group",
          containerClassName
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseMove={handleMouseMove}
        onClick={() => setIsOpen(true)}
      >
        <img
          src={src}
          alt={alt}
          className={cn(
            "object-cover transition-transform duration-300",
            isHovered && "scale-110",
            className
          )}
        />
        
        {/* Ícone de zoom */}
        <div className={cn(
          "absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200",
          isHovered && "opacity-100"
        )}>
          <ZoomIn className="w-6 h-6 text-white drop-shadow-lg" />
        </div>

        {/* Lente de zoom no hover */}
        {isHovered && (
          <div
            className="absolute w-24 h-24 border-2 border-white/80 rounded-full pointer-events-none shadow-lg overflow-hidden"
            style={{
              left: lensPosition.x - 48,
              top: lensPosition.y - 48,
              backgroundImage: `url(${src})`,
              backgroundSize: "400%",
              backgroundPosition: backgroundPosition,
              backgroundRepeat: "no-repeat",
            }}
          />
        )}
      </div>

      {/* Modal com imagem ampliada */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl p-2 bg-background/95 backdrop-blur">
          <img
            src={src}
            alt={alt}
            className="w-full h-auto max-h-[80vh] object-contain rounded"
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
