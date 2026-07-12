import { useMemo } from "react";

/**
 * Efeitos visuais futuristas para landing page.
 * - Aurora blobs animados
 * - Grid em perspectiva
 * - Partículas flutuantes
 * - Feixe de scan
 * - Ruído sutil
 * Puramente decorativo — pointer-events-none.
 */
export function FuturisticFX({ variant = "hero" }: { variant?: "hero" | "section" }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }).map(() => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 2.5 + 1,
        delay: Math.random() * 8,
        duration: Math.random() * 10 + 8,
        hue: Math.random() > 0.5 ? "cyan" : "indigo",
      })),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
      {/* Aurora blobs animados */}
      <div className="fx-aurora fx-aurora-1" />
      <div className="fx-aurora fx-aurora-2" />
      <div className="fx-aurora fx-aurora-3" />

      {/* Grid em perspectiva */}
      {variant === "hero" && (
        <div className="absolute inset-x-0 bottom-0 h-[55%] fx-grid-perspective opacity-40" />
      )}

      {/* Grid plano sutil */}
      <div className="absolute inset-0 fx-grid-flat opacity-[0.06]" />

      {/* Feixe de scan horizontal */}
      <div className="fx-scanbeam" />

      {/* Partículas */}
      {particles.map((p, i) => (
        <span
          key={i}
          className="fx-particle"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            background:
              p.hue === "cyan"
                ? "radial-gradient(circle, rgba(103,232,249,0.9), rgba(103,232,249,0))"
                : "radial-gradient(circle, rgba(165,180,252,0.9), rgba(165,180,252,0))",
          }}
        />
      ))}

      {/* Vinheta de bordas com gradiente sutil */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(7,8,15,0.85)_100%)]" />

      {/* Ruído */}
      <div className="fx-noise" />
    </div>
  );
}

export default FuturisticFX;
