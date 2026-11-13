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

export interface ObsConfig {
  host: string;
  port: number;
  password: string;
  remember: boolean;
  autoConnect: boolean;
  popup: ObsPopupConfig;
}

export interface ObsAnnounce { cliente?: string; produto?: string; codigo?: string; qtd?: number; valor?: number }

export const DEFAULT_OBS_CONFIG: ObsConfig = {
  host: 'localhost',
  port: 4455,
  password: '',
  remember: false,
  autoConnect: false,
  popup: { enabled: false, sceneName: '', textInput: '', showSource: '', seconds: 6, template: '@{cliente} pediu {produto} (x{qtd})' },
};

const KEY = 'cartzy_obs_config_v1';

function loadConfig(): ObsConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw) return DEFAULT_OBS_CONFIG;
    return { ...DEFAULT_OBS_CONFIG, ...raw, popup: { ...DEFAULT_OBS_CONFIG.popup, ...(raw.popup || {}) } };
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
}

const noop = async () => {};
const Ctx = createContext<ObsApi>({
  status: 'desconectado', error: '', version: '', config: DEFAULT_OBS_CONFIG, scenes: [], currentScene: '',
  setConfig: () => {}, connect: async () => false, disconnect: () => {}, refreshScenes: noop, switchScene: noop,
  textInputs: async () => [], sceneItems: async () => [], popup: noop, announce: () => {},
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

  // reconecta sozinho ao abrir o app, se o usuário pediu
  useEffect(() => {
    if (config.autoConnect) void connect();
    return () => clientRef.current.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useMemo<ObsApi>(() => ({
    status, error, version, config, scenes, currentScene, setConfig, connect, disconnect, refreshScenes, switchScene,
    textInputs: () => clientRef.current.textInputs(),
    sceneItems: (s: string) => clientRef.current.sceneItems(s),
    popup, announce,
  }), [status, error, version, config, scenes, currentScene, setConfig, connect, disconnect, refreshScenes, switchScene, popup, announce]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
