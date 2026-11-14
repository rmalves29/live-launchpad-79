/**
 * Conexão do Cartzy com o OBS Studio (OBS WebSocket v5), mantida enquanto o app está aberto.
 * A conexão sai deste navegador direto para o OBS desta máquina (ws://localhost:4455). Nada passa pelos servidores do Cartzy.
 * A configuração (e a senha, só se "lembrar") fica no localStorage DESTE computador.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ObsClient, ObsError, obsUrl, type ObsStatus } from '@/lib/obs-websocket';

export interface ObsPopupConfig {
  enabled: boolean;
  sceneName: string;   // cena onde está a fonte ('' = cena atual)
  textInput: string;   // fonte de TEXTO do OBS que recebe a mensagem
  showSource: string;  // item que aparece e some ('' = a própria fonte de texto)
  seconds: number;     // quanto tempo fica na tela
  template: string;    // {cliente} {produto} {codigo} {qtd} {valor}
}

export interface ObsFlashConfig {
  sceneName: string;   // cena onde está a fonte ('' = cena atual)
  textInput: string;   // fonte de TEXTO do OBS que mostra a oferta
  showSource: string;  // item que aparece e some ('' = a própria fonte de texto)
  seconds: number;     // duração padrão da oferta
  template: string;    // {produto} {codigo} {de} {por} {tempo}; quebras de linha são mantidas
}

export interface ObsFlashOffer { produto: string; codigo?: string; de?: number; por: number; seconds?: number }

export interface ObsConfig {
  host: string;
  port: number;
  password: string;
  remember: boolean;
  autoConnect: boolean;
  popup: ObsPopupConfig;
  flash: ObsFlashConfig;
}

export interface ObsAnnounce { cliente?: string; produto?: string; codigo?: string; qtd?: number; valor?: number }

export const DEFAULT_OBS_CONFIG: ObsConfig = {
  host: 'localhost',
  port: 4455,
  password: '',
  remember: false,
  autoConnect: false,
  popup: { enabled: false, sceneName: '', textInput: '', showSource: '', seconds: 6, template: '@{cliente} pediu {produto} (x{qtd})' },
  flash: { sceneName: '', textInput: '', showSource: '', seconds: 60, template: '⚡ OFERTA RELÂMPAGO ⚡\n{produto}\nDe {de} por {por}\nTermina em {tempo}' },
};

const KEY = 'cartzy_obs_config_v1';

function loadConfig(): ObsConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw) return DEFAULT_OBS_CONFIG;
    return { ...DEFAULT_OBS_CONFIG, ...raw, popup: { ...DEFAULT_OBS_CONFIG.popup, ...(raw.popup || {}) }, flash: { ...DEFAULT_OBS_CONFIG.flash, ...(raw.flash || {}) } };
  } catch { return DEFAULT_OBS_CONFIG; }
}

function saveConfig(c: ObsConfig) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...c, password: c.remember ? c.password : '' })); } catch { /* sem armazenamento: só não lembra */ }
}

export function fillTemplate(tpl: string, v: ObsAnnounce): string {
  const valor = v.valor != null ? v.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  return tpl
    .replace(/\{cliente\}/g, v.cliente ?? '')
    .replace(/\{produto\}/g, v.produto ?? '')
    .replace(/\{codigo\}/g, v.codigo ?? '')
    .replace(/\{qtd\}/g, v.qtd != null ? String(v.qtd) : '')
    .replace(/\{valor\}/g, valor)
    .replace(/\s+/g, ' ')
    .trim();
}

const brl = (v?: number) => (v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '');
export const formatCountdown = (secs: number) => {
  const t = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
/** Texto da oferta relâmpago (mantém as quebras de linha do modelo). */
export function fillFlash(tpl: string, o: ObsFlashOffer, remaining: number): string {
  return tpl
    .replace(/\{produto\}/g, o.produto)
    .replace(/\{codigo\}/g, o.codigo ?? '')
    .replace(/\{de\}/g, brl(o.de))
    .replace(/\{por\}/g, brl(o.por))
    .replace(/\{tempo\}/g, formatCountdown(remaining))
    .replace(/[ 	]+/g, ' ')
    .trim();
}

interface ObsApi {
  status: ObsStatus;
  error: string;
  version: string;
  config: ObsConfig;
  scenes: string[];
  currentScene: string;
  setConfig: (c: ObsConfig) => void;
  connect: (c?: ObsConfig) => Promise<boolean>;
  disconnect: () => void;
  refreshScenes: () => Promise<void>;
  switchScene: (name: string) => Promise<void>;
  textInputs: () => Promise<string[]>;
  sceneItems: (scene: string) => Promise<Array<{ id: number; name: string; enabled: boolean }>>;
  /** mostra um texto na tela do OBS pelo tempo configurado (fila: um por vez) */
  popup: (text: string, secondsOverride?: number) => Promise<void>;
  /** evento do Cartzy (pedido lançado…): monta o texto pelo modelo e mostra, se o pop-up estiver ligado e o OBS conectado */
  announce: (v: ObsAnnounce) => void;
  /** oferta relâmpago na tela do OBS, com contagem regressiva; uma por vez (a nova substitui a anterior) */
  flashOffer: (o: ObsFlashOffer) => Promise<void>;
  stopFlash: () => Promise<void>;
  flashActive: boolean;
}

const noop = async () => {};
const Ctx = createContext<ObsApi>({
  status: 'desconectado', error: '', version: '', config: DEFAULT_OBS_CONFIG, scenes: [], currentScene: '',
  setConfig: () => {}, connect: async () => false, disconnect: () => {}, refreshScenes: noop, switchScene: noop,
  textInputs: async () => [], sceneItems: async () => [], popup: noop, announce: () => {},
  flashOffer: noop, stopFlash: noop, flashActive: false,
});

export const useObs = () => useContext(Ctx);

export function ObsProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<ObsClient>(new ObsClient());
  const [config, setConfigState] = useState<ObsConfig>(loadConfig);
  const cfgRef = useRef(config);
  const [status, setStatus] = useState<ObsStatus>('desconectado');
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');
  const [scenes, setScenes] = useState<string[]>([]);
  const [currentScene, setCurrentScene] = useState('');
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const flashRef = useRef<{ timer: ReturnType<typeof setInterval>; scene: string; source: string } | null>(null);
  const [flashActive, setFlashActive] = useState(false);

  const setConfig = useCallback((c: ObsConfig) => { cfgRef.current = c; setConfigState(c); saveConfig(c); }, []);

  const refreshScenes = useCallback(async () => {
    const c = clientRef.current;
    if (!c.connected) return;
    try { const r = await c.scenes(); setScenes(r.scenes); setCurrentScene(r.current); } catch (e) { setError((e as Error).message); }
  }, []);

  const connect = useCallback(async (override?: ObsConfig) => {
    const cfg = override || cfgRef.current;
    if (override) setConfig(override);
    setStatus('conectando'); setError('');
    const c = clientRef.current;
    c.onClose = (reason) => { setStatus('desconectado'); setError(reason); setVersion(''); };
    try {
      const info = await c.connect(obsUrl(cfg.host, cfg.port), cfg.password);
      setVersion(info.obsVersion); setStatus('conectado');
      await refreshScenes();
      return true;
    } catch (e) {
      setStatus('erro'); setError(e instanceof ObsError ? e.message : (e as Error).message); setVersion('');
      return false;
    }
  }, [refreshScenes, setConfig]);

  const disconnect = useCallback(() => {
    if (flashRef.current) { clearInterval(flashRef.current.timer); flashRef.current = null; setFlashActive(false); }
    clientRef.current.close();
    setStatus('desconectado'); setError(''); setVersion(''); setScenes([]); setCurrentScene('');
  }, []);

  const switchScene = useCallback(async (name: string) => {
    await clientRef.current.setScene(name);
    setCurrentScene(name);
  }, []);

  const popup = useCallback((text: string, secondsOverride?: number) => {
    // fila: um pop-up de cada vez, para um não apagar o outro
    const job = async () => {
      const c = clientRef.current;
      const p = cfgRef.current.popup;
      if (!c.connected || !p.textInput || !text) return;
      try {
        const scene = p.sceneName || (await c.scenes()).current;
        const source = p.showSource || p.textInput;
        await c.setText(p.textInput, text);
        await c.setItemVisible(scene, source, true);
        await new Promise((ok) => setTimeout(ok, Math.max(1, secondsOverride ?? p.seconds) * 1000));
        await c.setItemVisible(scene, source, false);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    queueRef.current = queueRef.current.then(job, job);
    return queueRef.current;
  }, []);

  const announce = useCallback((v: ObsAnnounce) => {
    const p = cfgRef.current.popup;
    if (!p.enabled || !clientRef.current.connected) return;
    void popup(fillTemplate(p.template, v));
  }, [popup]);

  const stopFlash = useCallback(async () => {
    const f = flashRef.current;
    if (!f) return;
    clearInterval(f.timer);
    flashRef.current = null;
    setFlashActive(false);
    const c = clientRef.current;
    if (c.connected) { try { await c.setItemVisible(f.scene, f.source, false); } catch { /* OBS fechou */ } }
  }, []);

  const flashOffer = useCallback(async (o: ObsFlashOffer) => {
    const c = clientRef.current;
    const fl = cfgRef.current.flash;
    if (!c.connected) throw new Error('O OBS não está conectado.');
    if (!fl.textInput) throw new Error('Escolha a fonte de texto da oferta relâmpago.');
    await stopFlash();
    const scene = fl.sceneName || (await c.scenes()).current;
    const source = fl.showSource || fl.textInput;
    const total = Math.max(5, Math.min(3600, Math.floor(o.seconds ?? fl.seconds)));
    const endsAt = Date.now() + total * 1000;
    await c.setText(fl.textInput, fillFlash(fl.template, o, total));
    await c.setItemVisible(scene, source, true);
    setFlashActive(true);
    const timer = setInterval(async () => {
      const left = Math.ceil((endsAt - Date.now()) / 1000);
      if (left <= 0) { void stopFlash(); return; }
      try { await c.setText(fl.textInput, fillFlash(fl.template, o, left)); } catch { void stopFlash(); }
    }, 1000);
    flashRef.current = { timer, scene, source };
  }, [stopFlash]);

  // reconecta sozinho ao abrir o app, se o usuário pediu
  useEffect(() => {
    if (config.autoConnect) void connect();
    return () => { if (flashRef.current) clearInterval(flashRef.current.timer); clientRef.current.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useMemo<ObsApi>(() => ({
    status, error, version, config, scenes, currentScene, setConfig, connect, disconnect, refreshScenes, switchScene,
    textInputs: () => clientRef.current.textInputs(),
    sceneItems: (s: string) => clientRef.current.sceneItems(s),
    popup, announce, flashOffer, stopFlash, flashActive,
  }), [status, error, version, config, scenes, currentScene, setConfig, connect, disconnect, refreshScenes, switchScene, popup, announce, flashOffer, stopFlash, flashActive]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
