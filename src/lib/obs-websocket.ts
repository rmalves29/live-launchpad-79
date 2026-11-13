/**
 * Cliente mínimo do OBS WebSocket v5 (embutido no OBS 28+), feito para rodar no NAVEGADOR.
 * O OBS é local: a conexão sai do navegador desta máquina direto para ws://localhost:4455, nada passa pelos servidores do Cartzy.
 * Protocolo: Hello (op 0) -> Identify (op 1, com resposta ao desafio quando há senha) -> Identified (op 2) -> Request (op 6) / RequestResponse (op 7).
 */

export type ObsStatus = 'desconectado' | 'conectando' | 'conectado' | 'erro';

export interface ObsResult<T = any> {
  ok: boolean;
  code: number;
  comment?: string;
  data?: T;
}

export class ObsError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
    this.name = 'ObsError';
  }
}

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let bin = '';
  new Uint8Array(digest).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

/** Resposta ao desafio do OBS: base64(sha256(base64(sha256(senha + salt)) + desafio)). */
export async function obsAuthString(password: string, salt: string, challenge: string): Promise<string> {
  const secret = await sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
}

export function obsUrl(host: string, port: number): string {
  const h = host.trim().replace(/^wss?:\/\//i, '').replace(/\/+$/, '') || 'localhost';
  return `ws://${h}:${port}`;
}

type Pending = { resolve: (r: ObsResult) => void; timer: ReturnType<typeof setTimeout> };

export class ObsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;
  /** chamado quando a conexão cai depois de estabelecida */
  onClose?: (reason: string) => void;

  constructor(private WS: typeof WebSocket = (globalThis as any).WebSocket) {}

  get connected() {
    return !!this.ws && this.ws.readyState === 1 && this.identified;
  }
  private identified = false;

  connect(url: string, password: string, timeoutMs = 6000): Promise<{ obsVersion: string; wsVersion: string }> {
    this.close();
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (m: string, code?: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { this.ws?.close(); } catch { /* já fechado */ }
        this.ws = null;
        this.identified = false;
        reject(new ObsError(m, code));
      };
      const timer = setTimeout(() => fail('O OBS não respondeu. Confira se ele está aberto e se o servidor WebSocket está ativado.'), timeoutMs);

      let ws: WebSocket;
      try {
        ws = new this.WS(url, 'obswebsocket.json');
      } catch (e) {
        return fail(`Endereço inválido: ${(e as Error).message}`);
      }
      this.ws = ws;

      ws.onerror = () => fail('Não consegui conectar ao OBS. Ele está aberto? O servidor WebSocket está ativado (Ferramentas > Configurações do Servidor WebSocket)?');
      ws.onclose = (ev: CloseEvent) => {
        if (!settled) {
          fail(ev.code === 4009 ? 'Senha do OBS incorreta.' : `O OBS fechou a conexão (código ${ev.code}).`, ev.code);
          return;
        }
        this.identified = false;
        for (const [, p] of this.pending) { clearTimeout(p.timer); p.resolve({ ok: false, code: 0, comment: 'Conexão com o OBS encerrada' }); }
        this.pending.clear();
        this.onClose?.(ev.code === 4009 ? 'Senha do OBS incorreta.' : 'A conexão com o OBS foi encerrada.');
      };
      ws.onmessage = async (ev: MessageEvent) => {
        let msg: any;
        try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
        const { op, d } = msg || {};
        if (op === 0) {
          // Hello: com senha o OBS manda desafio
          const identify: any = { rpcVersion: 1, eventSubscriptions: 0 };
          if (d?.authentication) {
            if (!password) return fail('O OBS pede senha. Informe a senha do servidor WebSocket.');
            identify.authentication = await obsAuthString(password, d.authentication.salt, d.authentication.challenge);
          }
          ws.send(JSON.stringify({ op: 1, d: identify }));
        } else if (op === 2) {
          // Identified
          this.identified = true;
          const r = await this.request('GetVersion');
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ obsVersion: r.data?.obsVersion || '', wsVersion: r.data?.obsWebSocketVersion || '' });
        } else if (op === 7) {
          const p = this.pending.get(d?.requestId);
          if (!p) return;
          this.pending.delete(d.requestId);
          clearTimeout(p.timer);
          p.resolve({ ok: !!d.requestStatus?.result, code: d.requestStatus?.code ?? 0, comment: d.requestStatus?.comment, data: d.responseData });
        }
      };
    });
  }

  request<T = any>(requestType: string, requestData?: Record<string, unknown>, timeoutMs = 8000): Promise<ObsResult<T>> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState !== 1) return resolve({ ok: false, code: 0, comment: 'Não conectado ao OBS' });
      const requestId = `c${++this.seq}`;
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ ok: false, code: 0, comment: 'O OBS não respondeu a tempo' });
      }, timeoutMs);
      this.pending.set(requestId, { resolve: resolve as (r: ObsResult) => void, timer });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, ...(requestData ? { requestData } : {}) } }));
    });
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    this.identified = false;
    if (ws) {
      ws.onclose = null; ws.onerror = null; ws.onmessage = null;
      try { ws.close(); } catch { /* já fechado */ }
    }
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.resolve({ ok: false, code: 0, comment: 'Conexão encerrada' }); }
    this.pending.clear();
  }

  // ---------- ações que o Cartzy usa ----------
  async scenes(): Promise<{ current: string; scenes: string[] }> {
    const r = await this.request<{ currentProgramSceneName: string; scenes: Array<{ sceneName: string; sceneIndex: number }> }>('GetSceneList');
    if (!r.ok) throw new ObsError(r.comment || 'Não consegui listar as cenas');
    // o OBS devolve da última para a primeira (ordem inversa da tela)
    const names = [...(r.data?.scenes || [])].sort((a, b) => b.sceneIndex - a.sceneIndex).map((s) => s.sceneName);
    return { current: r.data?.currentProgramSceneName || '', scenes: names };
  }

  async setScene(sceneName: string) {
    const r = await this.request('SetCurrentProgramScene', { sceneName });
    if (!r.ok) throw new ObsError(r.comment || `Não consegui trocar para a cena "${sceneName}"`, r.code);
  }

  /** Fontes de texto do OBS (GDI+, FreeType 2…). */
  async textInputs(): Promise<string[]> {
    const r = await this.request<{ inputs: Array<{ inputName: string; inputKind: string }> }>('GetInputList');
    if (!r.ok) throw new ObsError(r.comment || 'Não consegui listar as fontes');
    return (r.data?.inputs || []).filter((i) => /text/i.test(i.inputKind)).map((i) => i.inputName);
  }

  async sceneItems(sceneName: string): Promise<Array<{ id: number; name: string; enabled: boolean }>> {
    const r = await this.request<{ sceneItems: Array<{ sceneItemId: number; sourceName: string; sceneItemEnabled: boolean }> }>('GetSceneItemList', { sceneName });
    if (!r.ok) throw new ObsError(r.comment || `Não consegui listar os itens da cena "${sceneName}"`);
    return (r.data?.sceneItems || []).map((i) => ({ id: i.sceneItemId, name: i.sourceName, enabled: i.sceneItemEnabled }));
  }

  async setText(inputName: string, text: string) {
    const r = await this.request('SetInputSettings', { inputName, inputSettings: { text }, overlay: true });
    if (!r.ok) throw new ObsError(r.comment || `Não consegui mudar o texto da fonte "${inputName}"`, r.code);
  }

  async setItemVisible(sceneName: string, sourceName: string, visible: boolean) {
    const id = await this.request<{ sceneItemId: number }>('GetSceneItemId', { sceneName, sourceName });
    if (!id.ok || id.data?.sceneItemId == null) {
      throw new ObsError(`A fonte "${sourceName}" não está direto na cena "${sceneName}" (se estiver dentro de um grupo, tire do grupo).`, id.code);
    }
    const r = await this.request('SetSceneItemEnabled', { sceneName, sceneItemId: id.data.sceneItemId, sceneItemEnabled: visible });
    if (!r.ok) throw new ObsError(r.comment || 'Não consegui mostrar/esconder a fonte', r.code);
  }
}
