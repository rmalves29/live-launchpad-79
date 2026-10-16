import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Camera, CameraOff, Mic, MicOff, RefreshCw } from 'lucide-react';

/**
 * Câmera da Live — COMPOSIÇÃO LOCAL (câmera + Product Pin em canvas 9:16 → MediaStream único).
 * Não grava, não faz upload, não transmite. Exclusivo Mania de Mulher (gate no componente pai).
 * Próxima etapa: consumir o stream composto via ref (getComposedStream) ou onComposedStream.
 */
export interface CameraOffer {
  name: string;
  imageUrl: string | null;
  basePrice: number;
  offerPrice: number;
  pct: number;
  remaining: number;
}

export interface LiveCameraPreviewHandle {
  /** MediaStream composto (vídeo do canvas + áudio do microfone) ou null se a câmera estiver parada. */
  getComposedStream: () => MediaStream | null;
}

interface Props {
  offer: CameraOffer | null;
  /** Chamado quando o stream composto fica pronto (stream) ou é encerrado (null). */
  onComposedStream?: (stream: MediaStream | null) => void;
}

type CamState = 'idle' | 'starting' | 'live' | 'denied' | 'unavailable' | 'error';

const CANVAS_W = 720;
const CANVAS_H = 1280;
const TARGET_FPS = 30;

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

function drawOffer(ctx: CanvasRenderingContext2D, offer: CameraOffer, img: HTMLImageElement | null) {
  const pad = 24, cardH = 200, x = pad, y = CANVAS_H - cardH - 40, w = CANVAS_W - pad * 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  roundRect(ctx, x, y, w, cardH, 28);
  ctx.fill();
  ctx.restore();

  const imgS = 152, ix = x + 24, iy = y + 24;
  ctx.save();
  roundRect(ctx, ix, iy, imgS, imgS, 20);
  ctx.clip();
  if (img && img.complete && img.naturalWidth > 0) {
    const s = Math.max(imgS / img.naturalWidth, imgS / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.drawImage(img, ix + (imgS - dw) / 2, iy + (imgS - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(ix, iy, imgS, imgS);
  }
  ctx.restore();

  const tx = ix + imgS + 24, ctaW = 150, textMax = x + w - tx - ctaW - 32;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#111827';
  ctx.font = '600 30px Inter, system-ui, sans-serif';
  ctx.fillText(truncate(ctx, offer.name, textMax), tx, iy + 4);

  ctx.fillStyle = '#dc2626';
  ctx.font = '800 40px Inter, system-ui, sans-serif';
  const priceTxt = brl(offer.offerPrice);
  ctx.fillText(priceTxt, tx, iy + 50);
  if (offer.pct > 0) {
    const pw = ctx.measureText(priceTxt).width;
    ctx.fillStyle = '#6b7280';
    ctx.font = '400 24px Inter, system-ui, sans-serif';
    const old = brl(offer.basePrice);
    const ox = tx + pw + 12, oy = iy + 62;
    ctx.fillText(old, ox, oy);
    const ow = ctx.measureText(old).width;
    ctx.fillRect(ox, oy + 12, ow, 2);
  }

  let bx = tx;
  const by = iy + 112;
  if (offer.pct > 0) {
    ctx.font = '700 22px Inter, system-ui, sans-serif';
    const t = `-${offer.pct}%`;
    const bw = ctx.measureText(t).width + 20;
    ctx.fillStyle = '#dc2626';
    roundRect(ctx, bx, by, bw, 34, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(t, bx + 10, by + 6);
    bx += bw + 12;
  }
  ctx.fillStyle = '#374151';
  ctx.font = '600 24px Inter, system-ui, sans-serif';
  ctx.fillText(`⏱ ${fmt(offer.remaining)}`, bx, by + 5);

  const cx = x + w - ctaW - 24, cy = y + (cardH - 64) / 2;
  ctx.fillStyle = '#111827';
  roundRect(ctx, cx, cy, ctaW, 64, 18);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 26px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Comprar', cx + ctaW / 2, cy + 18);
  ctx.textAlign = 'left';
}

export const LiveCameraPreview = forwardRef<LiveCameraPreviewHandle, Props>(function LiveCameraPreview({ offer, onComposedStream }, ref) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const composedRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const offerRef = useRef<CameraOffer | null>(offer);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const facingRef = useRef<'user' | 'environment'>('user');
  const mutedRef = useRef(false);
  const onComposedRef = useRef(onComposedStream);
  const fpsCounter = useRef({ frames: 0, since: performance.now() });

  const [state, setState] = useState<CamState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [muted, setMuted] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);
  const [info, setInfo] = useState<{ w: number; h: number; fps: number; src: string; audio: boolean } | null>(null);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => { offerRef.current = offer; }, [offer]);
  useEffect(() => { onComposedRef.current = onComposedStream; }, [onComposedStream]);

  // Carrega imagem do produto para desenhar no canvas (crossOrigin evita "tainted canvas").
  const imageUrl = offer?.imageUrl || null;
  useEffect(() => {
    if (!imageUrl) { imgRef.current = null; return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => { if (imgRef.current === img) imgRef.current = null; };
    img.src = imageUrl;
    imgRef.current = img;
  }, [imageUrl]);

  useImperativeHandle(ref, () => ({ getComposedStream: () => composedRef.current }), []);

  const drawLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        const s = Math.max(CANVAS_W / video.videoWidth, CANVAS_H / video.videoHeight);
        const dw = video.videoWidth * s, dh = video.videoHeight * s;
        ctx.save();
        if (facingRef.current === 'user') { ctx.translate(CANVAS_W, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, (CANVAS_W - dw) / 2, (CANVAS_H - dh) / 2, dw, dh);
        ctx.restore();
      }
      const o = offerRef.current;
      if (o) drawOffer(ctx, o, imgRef.current);

      const fc = fpsCounter.current;
      fc.frames++;
      const now = performance.now();
      if (now - fc.since >= 1000) {
        const fps = Math.round((fc.frames * 1000) / (now - fc.since));
        fc.frames = 0; fc.since = now;
        const v = videoRef.current;
        setInfo({
          w: CANVAS_W, h: CANVAS_H, fps,
          src: v && v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : '—',
          audio: !!composedRef.current?.getAudioTracks().some(t => t.readyState === 'live' && t.enabled),
        });
      }
    }
    rafRef.current = requestAnimationFrame(drawLoop);
  }, []);

  const stopAll = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    camStreamRef.current = null;
    composedRef.current?.getTracks().forEach(t => t.stop());
    const hadComposed = !!composedRef.current;
    composedRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setInfo(null);
    if (hadComposed) onComposedRef.current?.(null);
  }, []);

  const stop = () => { stopAll(); setState('idle'); };

  const start = async (mode: 'user' | 'environment' = facingRef.current) => {
    if (!supported) { setState('unavailable'); return; }
    setState('starting');
    setErrorMsg('');
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      // Troca de câmera: para só a câmera antiga; canvas e stream composto continuam.
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      camStreamRef.current = cam;
      facingRef.current = mode;
      setFacing(mode);

      if (!videoRef.current) {
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.autoplay = true;
        videoRef.current = v;
      }
      videoRef.current.srcObject = cam;
      await videoRef.current.play().catch(() => {});

      const newAudio = cam.getAudioTracks()[0] || null;
      if (newAudio) newAudio.enabled = !mutedRef.current;

      if (!composedRef.current) {
        const canvas = canvasRef.current!;
        const canvasStream = canvas.captureStream(TARGET_FPS);
        const composed = new MediaStream(canvasStream.getVideoTracks());
        if (newAudio) composed.addTrack(newAudio);
        composedRef.current = composed;
        if (rafRef.current == null) rafRef.current = requestAnimationFrame(drawLoop);
        onComposedRef.current?.(composed);
      } else {
        // Mantém o mesmo MediaStream composto; só substitui a faixa de áudio.
        const composed = composedRef.current;
        composed.getAudioTracks().forEach(t => composed.removeTrack(t));
        if (newAudio) composed.addTrack(newAudio);
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCanSwitch(devices.filter(d => d.kind === 'videoinput').length > 1);
      } catch { setCanSwitch(false); }
      setState('live');
    } catch (e: any) {
      const name = e?.name || '';
      if (!camStreamRef.current) stopAll();
      if (name === 'NotAllowedError' || name === 'SecurityError') setState('denied');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') { setState('unavailable'); setErrorMsg(e?.message || ''); }
      else { setState('error'); setErrorMsg(e?.message || String(e)); }
      if (camStreamRef.current) setState('live');
    }
  };

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    // Mesma faixa usada no stream composto → mute reflete nele automaticamente.
    composedRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
    camStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
  };

  useEffect(() => () => stopAll(), [stopAll]);

  const live = state === 'live';

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold flex items-center gap-2"><Camera className="h-4 w-4" />Câmera da Live</h3>
        <Badge variant="outline">COMPOSIÇÃO LOCAL · NÃO TRANSMITE</Badge>
      </div>

      <div className="p-3 rounded-md border border-amber-500/40 bg-amber-500/10 flex gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
        <p>
          O vídeo e a oferta são juntados <strong>somente neste aparelho</strong>. Nada é gravado, enviado ou transmitido ao Instagram —
          isso depende do gateway de transmissão, que ainda não existe. Nenhuma chave de transmissão é pedida ou guardada.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {!live ? (
          <Button onClick={() => start()} disabled={state === 'starting' || !supported}>
            <Camera className="h-4 w-4 mr-1" />{state === 'starting' ? 'Abrindo...' : 'Abrir câmera e microfone'}
          </Button>
        ) : (
          <Button variant="outline" onClick={stop}><CameraOff className="h-4 w-4 mr-1" />Parar câmera</Button>
        )}
        {live && canSwitch && (
          <Button variant="outline" onClick={() => start(facing === 'user' ? 'environment' : 'user')}>
            <RefreshCw className="h-4 w-4 mr-1" />{facing === 'user' ? 'Câmera traseira' : 'Câmera frontal'}
          </Button>
        )}
        {live && (
          <Button variant="outline" onClick={toggleMute}>
            {muted ? <><MicOff className="h-4 w-4 mr-1" />Ativar microfone</> : <><Mic className="h-4 w-4 mr-1" />Silenciar</>}
          </Button>
        )}
      </div>

      {!supported && <p className="text-sm text-destructive">Este navegador não permite acessar a câmera. Use Chrome ou Safari atualizado, em endereço seguro (https).</p>}
      {state === 'denied' && <p className="text-sm text-destructive">Permissão de câmera/microfone negada. Libere o acesso nas configurações do navegador e toque em "Abrir câmera" de novo.</p>}
      {state === 'unavailable' && supported && <p className="text-sm text-destructive">Câmera ou microfone indisponível (não encontrado ou em uso por outro app). {errorMsg}</p>}
      {state === 'error' && <p className="text-sm text-destructive">Não foi possível abrir a câmera: {errorMsg}</p>}

      <div className="mx-auto w-full max-w-[360px] space-y-2">
        <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-foreground/90 border">
          {/* O canvas É o vídeo composto (mesmo conteúdo capturado no MediaStream). */}
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className={`absolute inset-0 h-full w-full ${live ? '' : 'invisible'}`} />
          {!live && (
            <div className="absolute inset-0 flex items-center justify-center text-background/70 text-sm p-6 text-center">
              Câmera desligada
            </div>
          )}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <Badge variant="secondary">PREVIEW</Badge>
            {live && muted && <Badge variant="secondary"><MicOff className="h-3 w-3" /></Badge>}
          </div>
          {live && !offer && (
            <p className="absolute bottom-4 inset-x-0 text-center text-xs text-background/80">Fixe uma oferta acima para compor no vídeo</p>
          )}
        </div>
        {live && info && (
          <p className="text-[11px] font-mono text-muted-foreground text-center">
            stream composto pronto · {info.w}×{info.h} @ {info.fps}fps · câmera {info.src} · áudio {info.audio ? 'on' : 'off'}
          </p>
        )}
      </div>
    </Card>
  );
});
