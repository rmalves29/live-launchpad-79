/**
 * OBS Studio: o Cartzy controla o OBS pela WebSocket do próprio OBS (a conexão sai deste navegador para o OBS desta máquina).
 * Aqui se configura a conexão, se troca de cena e se define o pop-up que aparece na live quando um pedido é lançado.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, Plug, Unplug, RefreshCw, MonitorPlay, Send, AlertTriangle, Zap } from 'lucide-react';
import { useObs, fillTemplate, fillFlash, DEFAULT_OBS_CONFIG } from '@/contexts/ObsContext';

const STATUS_BADGE = {
  desconectado: { text: 'Desconectado', cls: 'bg-muted text-muted-foreground' },
  conectando: { text: 'Conectando…', cls: 'bg-amber-500 text-white hover:bg-amber-500' },
  conectado: { text: 'Conectado ao OBS', cls: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  erro: { text: 'Erro', cls: 'bg-destructive text-destructive-foreground hover:bg-destructive' },
} as const;

const selectCls = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

export default function ObsIntegration({ tenantId }: { tenantId?: string }) {
  const obs = useObs();
  const { config, status } = obs;
  const connected = status === 'conectado';
  const [busy, setBusy] = useState(false);
  const [textInputs, setTextInputs] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [flashItems, setFlashItems] = useState<string[]>([]);
  const [pSearch, setPSearch] = useState('');
  const [pResults, setPResults] = useState<Array<{ id: number; name: string; code: string | null; price: number }>>([]);
  const [offer, setOffer] = useState({ produto: '', codigo: '', de: '', por: '', seconds: '' });

  const set = (patch: Partial<typeof config>) => obs.setConfig({ ...config, ...patch });
  const setPopup = (patch: Partial<typeof config.popup>) => obs.setConfig({ ...config, popup: { ...config.popup, ...patch } });
  const setFlash = (patch: Partial<typeof config.flash>) => obs.setConfig({ ...config, flash: { ...config.flash, ...patch } });

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

  useEffect(() => {
    if (!connected) { setFlashItems([]); return; }
    const scene = config.flash.sceneName || obs.currentScene;
    if (!scene) return;
    obs.sceneItems(scene).then((l) => setFlashItems(l.map((i) => i.name))).catch(() => setFlashItems([]));
  }, [connected, config.flash.sceneName, obs.currentScene]); // eslint-disable-line react-hooks/exhaustive-deps

  // busca de produtos do Cartzy para preencher a oferta
  useEffect(() => {
    const q = pSearch.trim();
    if (!tenantId || q.length < 2) { setPResults([]); return; }
    const t = setTimeout(async () => {
      const safe = q.replace(/[%,()]/g, ' ');
      const { data } = await supabase.from('products').select('id, name, code, price')
        .eq('tenant_id', tenantId).eq('is_active', true).or(`name.ilike.%${safe}%,code.ilike.%${safe}%`).limit(8);
      setPResults((data || []) as any);
    }, 250);
    return () => clearTimeout(t);
  }, [pSearch, tenantId]);

  const offerData = () => {
    const por = Number(String(offer.por).replace(',', '.'));
    const de = Number(String(offer.de).replace(',', '.'));
    return { produto: offer.produto.trim(), codigo: offer.codigo.trim(), por, de: de > 0 ? de : undefined, seconds: offer.seconds ? Number(offer.seconds) : undefined };
  };
  async function launchOffer() {
    const o = offerData();
    if (!o.produto || !(o.por > 0)) { toast.error('Informe o produto e o preço da oferta.'); return; }
    try { await obs.flashOffer(o); toast.success('Oferta relâmpago no ar.'); } catch (e: any) { toast.error(e?.message || 'Não foi possível enviar ao OBS'); }
  }

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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-4 w-4" /> Oferta relâmpago na live</CardTitle>
              <CardDescription>
                Mostra na tela do OBS uma oferta com preço e contagem regressiva, e some sozinha quando o tempo acaba.
                Crie no OBS uma fonte de <b>Texto</b> para a oferta (já posicionada e formatada), escolha-a abaixo e lance a oferta aqui durante a live.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Fonte de texto da oferta</Label>
                  <select className={selectCls} value={config.flash.textInput} onChange={(e) => setFlash({ textInput: e.target.value })}>
                    <option value="">Escolha…</option>
                    {textInputs.map((t) => <option key={t} value={t}>{t}</option>)}
                    {config.flash.textInput && !textInputs.includes(config.flash.textInput) && <option value={config.flash.textInput}>{config.flash.textInput}</option>}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Cena onde ela está</Label>
                  <select className={selectCls} value={config.flash.sceneName} onChange={(e) => setFlash({ sceneName: e.target.value, showSource: '' })}>
                    <option value="">Cena atual do programa</option>
                    {obs.scenes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Item que aparece e some</Label>
                  <select className={selectCls} value={config.flash.showSource} onChange={(e) => setFlash({ showSource: e.target.value })}>
                    <option value="">A própria fonte de texto</option>
                    {flashItems.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="flash_secs">Duração padrão (segundos)</Label>
                  <Input id="flash_secs" type="number" min={5} max={3600} value={config.flash.seconds} onChange={(e) => setFlash({ seconds: Math.min(3600, Math.max(5, Number(e.target.value) || 60)) })} />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="flash_tpl">Modelo do texto</Label>
                <textarea id="flash_tpl" rows={4} className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={config.flash.template} onChange={(e) => setFlash({ template: e.target.value })} />
                <p className="text-xs text-muted-foreground">Variáveis: {'{produto}'} {'{codigo}'} {'{de}'} {'{por}'} {'{tempo}'} (contagem em mm:ss).</p>
              </div>

              <div className="space-y-3 border-t pt-3">
                <p className="text-sm font-medium">Lançar uma oferta</p>
                {tenantId && (
                  <div className="space-y-1">
                    <Input placeholder="Buscar produto do Cartzy (nome ou código)…" value={pSearch} onChange={(e) => setPSearch(e.target.value)} />
                    {pResults.length > 0 && (
                      <div className="rounded-md border divide-y max-h-48 overflow-auto">
                        {pResults.map((p) => (
                          <button key={p.id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => { setOffer({ ...offer, produto: p.name, codigo: p.code || '', de: String(p.price ?? ''), por: '' }); setPSearch(''); setPResults([]); }}>
                            <span>{p.name}{p.code ? <span className="text-xs text-muted-foreground"> · {p.code}</span> : null}</span>
                            <span className="text-xs text-muted-foreground">{Number(p.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1 sm:col-span-2"><Label>Produto</Label><Input value={offer.produto} onChange={(e) => setOffer({ ...offer, produto: e.target.value })} /></div>
                  <div className="space-y-1"><Label>De (R$)</Label><Input inputMode="decimal" value={offer.de} onChange={(e) => setOffer({ ...offer, de: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Por (R$)</Label><Input inputMode="decimal" value={offer.por} onChange={(e) => setOffer({ ...offer, por: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Duração (s)</Label><Input type="number" min={5} placeholder={String(config.flash.seconds)} value={offer.seconds} onChange={(e) => setOffer({ ...offer, seconds: e.target.value })} /></div>
                </div>
                {offer.produto && Number(String(offer.por).replace(',', '.')) > 0 && (
                  <pre className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{fillFlash(config.flash.template, offerData() as any, offerData().seconds ?? config.flash.seconds)}</pre>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={launchOffer} disabled={!config.flash.textInput}><Zap className="mr-2 h-4 w-4" />Lançar oferta</Button>
                  <Button variant="outline" onClick={() => obs.stopFlash()} disabled={!obs.flashActive}>Encerrar agora</Button>
                  {obs.flashActive && <Badge className="bg-amber-500 text-white hover:bg-amber-500">No ar</Badge>}
                </div>
                {!config.flash.textInput && <p className="text-xs text-muted-foreground">Escolha a fonte de texto acima para poder lançar.</p>}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
