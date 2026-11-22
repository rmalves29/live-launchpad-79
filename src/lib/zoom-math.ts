// Contas do zoom da foto ampliada (Loja da Live). Pontos são medidos a partir do centro da área da foto.
export type Pt = { x: number; y: number };
export type ZoomView = { s: number; x: number; y: number };
export type ZoomBox = { stageW: number; stageH: number; imgW: number; imgH: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clampScale = (s: number) => clamp(Number.isFinite(s) ? s : MIN_ZOOM, MIN_ZOOM, MAX_ZOOM);

/** Muda o zoom mantendo parado o ponto `p` (dedo/cursor). */
export function zoomAt(v: ZoomView, nextScale: number, p: Pt): ZoomView {
  const s = clampScale(nextScale);
  const k = s / v.s;
  return { s, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k };
}

/** Pinça com dois dedos: escala pela distância e acompanha o ponto médio. */
export function pinchView(start: ZoomView, a0: Pt, b0: Pt, a: Pt, b: Pt): ZoomView {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const s = clampScale((start.s * d) / d0);
  const k = s / start.s;
  return { s, x: m.x - (m0.x - start.x) * k, y: m.y - (m0.y - start.y) * k };
}

/** Não deixa a foto sair da tela; sem zoom, volta ao centro. */
export function clampPan(v: ZoomView, box: ZoomBox): ZoomView {
  const s = clampScale(v.s);
  if (s <= MIN_ZOOM) return { s: MIN_ZOOM, x: 0, y: 0 };
  const mx = Math.max(0, (box.imgW * s - box.stageW) / 2);
  const my = Math.max(0, (box.imgH * s - box.stageH) / 2);
  return { s, x: clamp(v.x, -mx, mx), y: clamp(v.y, -my, my) };
}
