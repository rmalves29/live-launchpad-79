import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Camera, CameraOff, Mic, MicOff, RefreshCw, ShoppingBag, Timer } from 'lucide-react';

/** Câmera da Live — PREVIEW/COMPOSIÇÃO LOCAL. Não transmite nada. Exclusivo Mania de Mulher (gate no pai). */
export interface CameraOffer {
  name: string;
  imageUrl: string | null;
  basePrice: number;
  offerPrice: number;
  pct: number;
  remaining: number;
}

type CamState = 'idle' | 'starting' | 'live' | 'denied' | 'unavailable' | 'error';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function LiveCameraPreview({ offer }: { offer: CameraOffer | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CamState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [muted, setMuted] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const stop = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState('idle');
  };

  const start = async (mode: 'user' | 'environment' = facing) => {
    if (!supported) { setState('unavailable'); return; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    setState('starting');
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, aspectRatio: { ideal: 9 / 16 }, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      streamRef.current = stream;
      stream.getAudioTracks().forEach(t => { t.enabled = !muted; });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCanSwitch(devices.filter(d => d.kind === 'videoinput').length > 1);
      } catch { setCanSwitch(false); }
      setFacing(mode);
      setState('live');
    } catch (e: any) {
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') setState('denied');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') { setState('unavailable'); setErrorMsg(e?.message || ''); }
      else { setState('error'); setErrorMsg(e?.message || String(e)); }
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
  };

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const live = state === 'live';

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold flex items-center gap-2"><Camera className="h-4 w-4" />Câmera da Live</h3>
        <Badge variant="outline">PREVIEW LOCAL · NÃO TRANSMITE</Badge>
      </div>

      <div className="p-3 rounded-md border border-amber-500/40 bg-amber-500/10 flex gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
        <p>
          Esta etapa é apenas <strong>preview e composição local</strong> no seu aparelho. O vídeo <strong>não é enviado ao Instagram</strong> nem gravado —
          isso só será possível quando o gateway de transmissão existir. Nenhuma chave de transmissão é pedida ou guardada.
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

      <div className="mx-auto w-full max-w-[360px]">
        <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-foreground/90 border">
          <video ref={videoRef} playsInline muted autoPlay
            className={`absolute inset-0 h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''} ${live ? '' : 'hidden'}`} />
          {!live && (
            <div className="absolute inset-0 flex items-center justify-center text-background/70 text-sm p-6 text-center">
              Câmera desligada
            </div>
          )}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <Badge variant="secondary">PREVIEW</Badge>
            {live && muted && <Badge variant="secondary"><MicOff className="h-3 w-3" /></Badge>}
          </div>
          {offer ? (
            <div className="absolute left-2 right-2 bottom-3 rounded-xl bg-background/95 shadow-lg p-2 flex gap-2 items-center animate-in slide-in-from-bottom-4">
              {offer.imageUrl ? <img src={offer.imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <div className="h-16 w-16 rounded-lg bg-muted" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{offer.name}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-bold text-destructive">{brl(offer.offerPrice)}</span>
                  {offer.pct > 0 && <span className="text-[10px] line-through text-muted-foreground">{brl(offer.basePrice)}</span>}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {offer.pct > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">-{offer.pct}%</Badge>}
                  <span className="text-[10px] text-muted-foreground flex items-center"><Timer className="h-3 w-3 mr-0.5" />{fmt(offer.remaining)}</span>
                </div>
              </div>
              <Button size="sm" className="h-8 px-3"><ShoppingBag className="h-3 w-3 mr-1" />Comprar</Button>
            </div>
          ) : (
            <p className="absolute bottom-4 inset-x-0 text-center text-xs text-background/80">Fixe uma oferta acima para vê-la aqui</p>
          )}
        </div>
      </div>
    </Card>
  );
}
