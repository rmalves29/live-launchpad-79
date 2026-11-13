/**
 * OBS Studio: o Cartzy controla o OBS pela WebSocket do próprio OBS (a conexão sai deste navegador para o OBS desta máquina).
 * Aqui se configura a conexão, se troca de cena e se define o pop-up que aparece na live quando um pedido é lançado.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, Plug, Unplug, RefreshCw, MonitorPlay, Send, AlertTriangle } from 'lucide-react';
import { useObs, fillTemplate, DEFAULT_OBS_CONFIG } from '@/contexts/ObsContext';

const STATUS_BADGE = {
  desconectado: { text: 'Desconectado', cls: 'bg-muted text-muted-foreground' },
  conectando: { text: 'Conectando…', cls: 'bg-amber-500 text-white hover:bg-amber-500' },
  conectado: { text: 'Conectado ao OBS', cls: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  erro: { text: 'Erro', cls: 'bg-destructive text-destructive-foreground hover:bg-destructive' },
} as const;

const selectCls = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

export default function ObsIntegration() {
  const obs = useObs();
  const { config, status } = obs;
  const connected = status === 'conectado';
  const [busy, setBusy] = useState(false);
  const [textInputs, setTextInputs] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  const set = (patch: Partial<typeof config>) => obs.setConfig({ ...config, ...patch });
  const setPopup = (patch: Partial<typeof config.popup>) => obs.setConfig({ ...config, popup: { ...config.popup, ...patch } });

  async function connect() {
    setBusy(true);
    const ok = await obs.connect(config);
    setBusy(false);
    if (ok) toast.success('Conectado ao OBS.');
  }

  // com o OBS conectado, carrega as fontes de texto e os itens da cena escolhida
  useEffect(() => {
    if (!connected) { setTextInputs([]); setItems([]); return; }
    obs.textInputs().then(setTextInputs).catch(() => setTextInputs([]));
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!connected) return;
    const scene = config.popup.sceneName || obs.currentScene;
    if (!scene) return;
    obs.sceneItems(scene).then((l) => setItems(l.map((i) => i.name))).catch(() => setItems([]));
  }, [connected, config.popup.sceneName, obs.currentScene]); // eslint-disable-line react-hooks/exhaustive-deps

  async function test(text: string) {
    if (!config.popup.textInput) { toast.error('Escolha a fonte de texto do OBS primeiro.'); return; }
    toast.message('Enviando ao OBS…');
    await obs.popup(text);
  }

  const badge = STATUS_BADGE[status];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2"><MonitorPlay className="h-5 w-5" /> OBS Studio</CardTitle>
            <Badge className={badge.cls}>{badge.text}{connected && obs.version ? ` · OBS ${obs.version}` : ''}</Badge>
          </div>
          <CardDescription>
            O Cartzy controla o OBS pela WebSocket do próprio OBS: troca de cena e pop-up na live quando você lança um pedido.
            A conexão sai <b>deste navegador</b> direto para o OBS <b>deste computador</b>: o Cartzy precisa estar aberto na mesma máquina do OBS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3 text-sm space-y-1">
            <p className="font-medium">No OBS (versão 28 ou mais nova):</p>
            <ol className="list-decimal pl-5 text-muted-foreground space-y-0.5">
              <li>Abra <b>Ferramentas → Configurações do Servidor WebSocket</b>.</li>
              <li>Marque <b>Ativar servidor WebSocket</b> (porta padrão 4455).</li>
              <li>Marque <b>Ativar autenticação</b> e defina uma senha (recomendado). Clique em OK.</li>
              <li>Volte aqui, informe a senha e clique em <b>Conectar</b>.</li>
            </ol>
            <p className="text-xs text-muted-foreground pt-1">Funciona no Chrome e no Edge. O Safari bloqueia esse tipo de conexão.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="obs_host">Endereço</Label>
              <Input id="obs_host" value={config.host} onChange={(e) => set({ host: e.target.value })} disabled={connected} placeholder="localhost" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="obs_port">Porta</Label>
              <Input id="obs_port" type="number" value={config.port} onChange={(e) => set({ port: Number(e.target.value) || 4455 })} disabled={connected} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="obs_pass">Senha do servidor</Label>
              <Input id="obs_pass" type="password" value={config.password} onChange={(e) => set({ password: e.target.value })} disabled={connected} autoComplete="off" placeholder="(sem senha)" />
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm"><Switch checked={config.remember} onCheckedChange={(v) => set({ remember: v })} />Lembrar a senha neste computador</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={config.autoConnect} onCheckedChange={(v) => set({ autoConnect: v })} />Conectar sozinho ao abrir o Cartzy</label>
          </div>

          {obs.error && status !== 'conectado' && (
            <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{obs.error}</AlertDescription></Alert>
          )}

          <div className="flex gap-2">
            {!connected ? (
              <Button onClick={connect} disabled={busy || status === 'conectando'}>
                {busy || status === 'conectando' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}Conectar
              </Button>
            ) : (
              <Button variant="outline" onClick={() => obs.disconnect()}><Unplug className="mr-2 h-4 w-4" />Desconectar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {connected && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cenas</CardTitle>
              <CardDescription>Clique para trocar a cena do programa agora.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {obs.scenes.map((s) => (
                  <Button key={s} size="sm" variant={s === obs.currentScene ? 'default' : 'outline'}
                    onClick={() => obs.switchScene(s).catch((e) => toast.error(e.message))}>{s}</Button>
                ))}
                <Button size="icon" variant="ghost" onClick={() => obs.refreshScenes()} aria-label="Atualizar cenas"><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pop-up na live</CardTitle>
              <CardDescription>
                Quando você lança um pedido nas telas <b>Lançar pedidos Instagram</b> e <b>TikTok</b>, o Cartzy escreve a mensagem numa fonte de texto do OBS,
                mostra essa fonte e esconde depois do tempo escolhido. Crie no OBS uma fonte de <b>Texto</b> (já posicionada e formatada) e escolha-a abaixo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 text-sm"><Switch checked={config.popup.enabled} onCheckedChange={(v) => setPopup({ enabled: v })} />Mostrar pop-up quando um pedido for lançado</label>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Fonte de texto do OBS</Label>
                  <select className={selectCls} value={config.popup.textInput} onChange={(e) => setPopup({ textInput: e.target.value })}>
                    <option value="">Escolha…</option>
                    {textInputs.map((t) => <option key={t} value={t}>{t}</option>)}
                    {config.popup.textInput && !textInputs.includes(config.popup.textInput) && <option value={config.popup.textInput}>{config.popup.textInput}</option>}
                  </select>
                  {textInputs.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma fonte de texto encontrada. No OBS, adicione uma fonte do tipo "Texto".</p>}
                </div>
                <div className="space-y-1">
                  <Label>Cena onde ela está</Label>
                  <select className={selectCls} value={config.popup.sceneName} onChange={(e) => setPopup({ sceneName: e.target.value, showSource: '' })}>
                    <option value="">Cena atual do programa</option>
                    {obs.scenes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Item que aparece e some</Label>
                  <select className={selectCls} value={config.popup.showSource} onChange={(e) => setPopup({ showSource: e.target.value })}>
                    <option value="">A própria fonte de texto</option>
                    {items.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground">Use outro item se o texto fica sobre uma imagem de fundo (agrupe os dois no OBS e escolha o grupo).</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="obs_secs">Segundos na tela</Label>
                  <Input id="obs_secs" type="number" min={1} max={60} value={config.popup.seconds} onChange={(e) => setPopup({ seconds: Math.min(60, Math.max(1, Number(e.target.value) || 6)) })} />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="obs_tpl">Mensagem</Label>
                <Input id="obs_tpl" value={config.popup.template} onChange={(e) => setPopup({ template: e.target.value })} />
                <p className="text-xs text-muted-foreground">Variáveis: {'{cliente}'} {'{produto}'} {'{codigo}'} {'{qtd}'} {'{valor}'}. Exemplo: {fillTemplate(config.popup.template, { cliente: 'maria', produto: 'Colar Riviera', codigo: 'C101', qtd: 1, valor: 39.9 }) || '—'}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => test(fillTemplate(config.popup.template, { cliente: 'maria', produto: 'Colar Riviera', codigo: 'C101', qtd: 1, valor: 39.9 }))}>
                  <Send className="mr-2 h-4 w-4" />Testar pop-up
                </Button>
                <Input className="max-w-xs" placeholder="Mensagem livre…" value={message} onChange={(e) => setMessage(e.target.value)} />
                <Button variant="outline" disabled={!message.trim()} onClick={() => { void test(message.trim()); setMessage(''); }}>Enviar ao OBS</Button>
                <Button variant="ghost" size="sm" onClick={() => obs.setConfig({ ...config, popup: DEFAULT_OBS_CONFIG.popup })}>Restaurar padrão</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
