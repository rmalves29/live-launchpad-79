import { useEffect, useRef, useState } from 'react';
import { clampPan, DOUBLE_TAP_ZOOM, pinchView, zoomAt, type Pt, type ZoomView } from '@/lib/zoom-math';

// Foto ampliada da Loja da Live: pinça/duplo toque/roda do mouse para ampliar, arrastar quando ampliada,
// fecha com X, Esc ou toque fora da foto. Não mexe em carrinho, variação nem checkout.
type Props = { src: string; alt: string; onClose: () => void };

const START: ZoomView = { s: 1, x: 0, y: 0 };

export default function ImageLightbox({ src, alt, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<ZoomView>(START);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [gesturing, setGesturing] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const pointers = useRef(new Map<number, Pt>());
  const base = useRef<{ view: ZoomView; a: Pt; b?: Pt } | null>(null);
  const moved = useRef(false);
  const downOnImage = useRef(false);
  const lastTap = useRef<{ t: number; p: Pt } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const touchHint = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  const toLocal = (clientX: number, clientY: number): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };
  const fit = (v: ZoomView) => {
    const st = stageRef.current;
    const im = imgRef.current;
    if (!st || !im) return START;
    const cs = getComputedStyle(st);
    const stageW = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const stageH = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return clampPan(v, { stageW: Math.max(stageW, st.clientWidth * 0.5), stageH: Math.max(stageH, st.clientHeight * 0.5), imgW: im.offsetWidth, imgH: im.offsetHeight });
  };

  // Esc fecha, página não rola por trás, foco vai para o X e volta ao lugar de antes ao fechar.
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCloseRef.current(); }
      else if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); }
    };
    const onResize = () => setView(START);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  // Roda do mouse / pinça do touchpad (precisa de listener não passivo para não rolar a página).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const v = viewRef.current;
      setView(fit(zoomAt(v, v.s * Math.exp(-dy * 0.0015), toLocal(e.clientX, e.clientY))));
    };
    const stopGesture = (e: Event) => e.preventDefault(); // Safari: evita zoom da página inteira
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', stopGesture);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', stopGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stageRef.current?.setPointerCapture?.(e.pointerId);
    const p = toLocal(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const pts = Array.from(pointers.current.values());
    if (pts.length === 1) {
      moved.current = false;
      downOnImage.current = e.target === imgRef.current;
      base.current = { view: viewRef.current, a: p };
    } else {
      moved.current = true;
      base.current = { view: viewRef.current, a: pts[0], b: pts[1] };
    }
    setGesturing(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId) || !base.current) return;
    const p = toLocal(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const pts = Array.from(pointers.current.values());
    const b = base.current;
    if (pts.length >= 2 && b.b) {
      setView(fit(pinchView(b.view, b.a, b.b, pts[0], pts[1])));
    } else if (pts.length === 1) {
      const dx = p.x - b.a.x;
      const dy = p.y - b.a.y;
      if (Math.hypot(dx, dy) > 6) moved.current = true;
      if (b.view.s > 1) setView(fit({ s: b.view.s, x: b.view.x + dx, y: b.view.y + dy }));
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = toLocal(e.clientX, e.clientY);
    pointers.current.delete(e.pointerId);
    const rest = Array.from(pointers.current.values());
    if (rest.length === 1) { base.current = { view: viewRef.current, a: rest[0] }; return; }
    if (rest.length > 1) { base.current = { view: viewRef.current, a: rest[0], b: rest[1] }; return; }
    base.current = null;
    setGesturing(false);
    if (moved.current || e.type === 'pointercancel') return;
    if (!downOnImage.current) { onClose(); return; } // toque fora da foto
    const now = Date.now();
    const last = lastTap.current;
    if (last && now - last.t < 320 && Math.hypot(p.x - last.p.x, p.y - last.p.y) < 30) {
      lastTap.current = null;
      const v = viewRef.current;
      setView(v.s > 1 ? START : fit(zoomAt(v, DOUBLE_TAP_ZOOM, p)));
    } else {
      lastTap.current = { t: now, p };
    }
  };

  return (
    <div className="lbx" role="dialog" aria-modal="true" aria-label={`Foto ampliada: ${alt}`}>
      <div
        ref={stageRef}
        className="lbx-stage"
        data-zoomed={view.s > 1 ? '' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {status === 'loading' && <div className="lbx-msg" aria-live="polite">Carregando foto…</div>}
        {status === 'error' && <div className="lbx-msg" role="alert">Não foi possível carregar a foto.</div>}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('error')}
          style={{
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})`,
            transition: gesturing ? 'none' : 'transform .2s ease-out',
            visibility: status === 'error' ? 'hidden' : undefined,
          }}
        />
      </div>
      <button ref={closeRef} className="lbx-x" onClick={onClose} aria-label="Fechar foto" type="button">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <div className="lbx-cap">
        {alt ? <b>{alt}</b> : null}
        <small>{touchHint ? 'Use dois dedos ou toque duas vezes para ampliar' : 'Role o mouse ou clique duas vezes para ampliar'}</small>
      </div>
    </div>
  );
}
