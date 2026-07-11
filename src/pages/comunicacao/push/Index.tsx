import { useEffect, useMemo, useState } from 'react';
import { Bell, Users, LayoutTemplate, Send, BarChart3, Trash2, RefreshCw, ExternalLink, Copy, Share2, QrCode } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { formatBrasiliaDate } from '@/lib/date-utils';

type TplType = 'cart_item_added' | 'cart_item_removed' | 'order_paid' | 'tracking_code' | 'waitlist';

const TPL_LABEL: Record<TplType, string> = {
  cart_item_added: 'Produto no carrinho',
  cart_item_removed: 'Produto cancelado',
  order_paid: 'Pedido pago',
  tracking_code: 'Código de rastreio',
  waitlist: 'Fila de espera',
};

const TPL_VARS: Record<TplType, string[]> = {
  cart_item_added: ['{nome}', '{produto}'],
  cart_item_removed: ['{nome}', '{produto}'],
  order_paid: ['{nome}', '{pedido_numero}'],
  tracking_code: ['{nome}', '{codigo_rastreio}', '{pedido_numero}'],
  waitlist: ['{nome}', '{produto}'],
};

const tabTrig = 'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-slate-500 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent hover:text-[#4f46e5] data-[state=active]:text-[#4f46e5] data-[state=active]:border-[#4f46e5] data-[state=active]:shadow-none transition-colors';

export default function PushPage() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const tenantId = tenant?.id;
  const tenantSlug = (tenant as any)?.slug;

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 pt-7">
        <div className="flex items-center gap-3 mb-1.5">
          <Bell className="h-7 w-7 text-[#4f46e5]" />
          <h1 className="text-[24px] font-bold text-slate-900">Notificações Push</h1>
        </div>
        <p className="text-slate-500 text-[13px] mb-5">Assinantes, templates, campanhas e relatórios em um só lugar.</p>

        {tenantSlug && <ShareLinkCard slug={tenantSlug} />}
      </div>

      <Tabs defaultValue="subscribers" className="w-full">
        <div className="border-b border-slate-200 px-8 sticky top-0 bg-white z-10">
          <TabsList className="h-auto p-0 bg-transparent rounded-none gap-0 justify-start">
            <TabsTrigger value="subscribers" className={tabTrig}><Users className="h-3.5 w-3.5" />Assinantes</TabsTrigger>
            <TabsTrigger value="templates" className={tabTrig}><LayoutTemplate className="h-3.5 w-3.5" />Templates</TabsTrigger>
            <TabsTrigger value="campaign" className={tabTrig}><Send className="h-3.5 w-3.5" />Nova Campanha</TabsTrigger>
            <TabsTrigger value="reports" className={tabTrig}><BarChart3 className="h-3.5 w-3.5" />Relatórios</TabsTrigger>
          </TabsList>
        </div>

        <div className="px-8 py-6">
          <TabsContent value="subscribers" className="mt-0"><SubscribersTab tenantId={tenantId} /></TabsContent>
          <TabsContent value="templates" className="mt-0"><TemplatesTab tenantId={tenantId} /></TabsContent>
          <TabsContent value="campaign" className="mt-0"><CampaignTab tenantId={tenantId} /></TabsContent>
          <TabsContent value="reports" className="mt-0"><ReportsTab tenantId={tenantId} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/* ================= Share Link ================= */
function ShareLinkCard({ slug }: { slug: string }) {
  const { toast } = useToast();
  const url = `https://app.orderzaps.com/t/${slug}/push`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copiado!', description: 'Cole onde quiser divulgar.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const share = async () => {
    const text = `Ative as notificações e receba novidades e status do seu pedido no celular: ${url}`;
    if ((navigator as any).share) {
      try { await (navigator as any).share({ title: 'Ative as notificações', text, url }); return; } catch {}
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="mb-5 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-4 flex flex-col md:flex-row items-start md:items-center gap-4">
      <img src={qrUrl} alt="QR code" className="h-[110px] w-[110px] rounded-md bg-white border border-slate-200" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
          <Share2 className="h-4 w-4 text-[#4f46e5]" />
          Link de divulgação
        </div>
        <p className="text-xs text-slate-500 mt-0.5 mb-2">
          Compartilhe este link para que seus clientes ativem as notificações direto no celular.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[240px] font-mono text-xs bg-white border border-slate-200 rounded-md px-3 py-2 truncate">
            {url}
          </div>
          <Button size="sm" variant="outline" onClick={copy}>
            <Copy className="h-4 w-4 mr-1.5" /> Copiar
          </Button>
          <Button size="sm" variant="outline" onClick={share}>
            <Share2 className="h-4 w-4 mr-1.5" /> Compartilhar
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1.5" /> Abrir
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={qrUrl} download={`push-${slug}.png`}>
              <QrCode className="h-4 w-4 mr-1.5" /> Baixar QR
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ================= Subscribers ================= */
function SubscribersTab({ tenantId }: { tenantId?: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [tenantId]);

  const isMobileUA = (ua?: string) => !!ua && /android|iphone|ipad|ipod|mobile|windows phone/i.test(ua);

  const grouped = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of rows) {
      const key = (r.phone || `id:${r.id}`).toString();
      const isMobile = isMobileUA(r.user_agent);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          ids: [r.id],
          name: r.name || '',
          phone: r.phone || '',
          instagram_handle: r.instagram_handle || '',
          cell: isMobile && r.is_active,
          pc: !isMobile && r.is_active,
          created_at: r.created_at,
        });
      } else {
        existing.ids.push(r.id);
        if (isMobile && r.is_active) existing.cell = true;
        if (!isMobile && r.is_active) existing.pc = true;
        if (!existing.name && r.name) existing.name = r.name;
        if (!existing.instagram_handle && r.instagram_handle) existing.instagram_handle = r.instagram_handle;
        if (new Date(r.created_at) < new Date(existing.created_at)) existing.created_at = r.created_at;
      }
    }
    return Array.from(map.values());
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return grouped;
    return grouped.filter((r) => (r.name || '').toLowerCase().includes(s) || (r.phone || '').includes(s) || (r.instagram_handle || '').toLowerCase().includes(s));
  }, [grouped, q]);

  const remove = async (ids: number[]) => {
    await supabase.from('push_subscriptions').delete().in('id', ids);
    toast({ title: 'Assinante removido' });
    load();
  };

  const YesNo = ({ v }: { v: boolean }) => v
    ? <Badge variant="outline" className="border-emerald-300 text-emerald-700">Sim</Badge>
    : <Badge variant="outline" className="text-muted-foreground">Não</Badge>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Assinantes ({grouped.length})</CardTitle>
        <div className="flex gap-2 items-center">
          <Input placeholder="Buscar por nome, telefone ou @instagram" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr><th className="py-2">Nome</th><th>Telefone</th><th>@Instagram</th><th className="text-center">PC</th><th className="text-center">Cell</th><th>Cadastro</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.key} className="border-b hover:bg-muted/30">
                    <td className="py-2">{r.name || '—'}</td>
                    <td>{r.phone || '—'}</td>
                    <td>{r.instagram_handle ? `@${r.instagram_handle}` : '—'}</td>
                    <td className="text-center"><YesNo v={r.pc} /></td>
                    <td className="text-center"><YesNo v={r.cell} /></td>
                    <td className="text-xs">{formatBrasiliaDate(r.created_at)}</td>
                    <td><Button variant="ghost" size="sm" onClick={() => remove(r.ids)}><Trash2 className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Nenhum assinante ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ================= Templates ================= */
function TemplatesTab({ tenantId }: { tenantId?: string }) {
  const { toast } = useToast();
  const [tpls, setTpls] = useState<Record<TplType, any>>({} as any);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase.from('push_templates').select('*').eq('tenant_id', tenantId);
    const map: any = {};
    (data || []).forEach((t: any) => (map[t.type] = t));
    setTpls(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, [tenantId]);

  const save = async (type: TplType, patch: any) => {
    if (!tenantId) return;
    const current = tpls[type] || { tenant_id: tenantId, type, title: '', body: '', is_enabled: false };
    const next = { ...current, ...patch };
    setTpls((s) => ({ ...s, [type]: next }));
    if (current.id) {
      await supabase.from('push_templates').update(patch).eq('id', current.id);
    } else {
      const { data } = await supabase.from('push_templates').insert(next).select('*').single();
      if (data) setTpls((s) => ({ ...s, [type]: data }));
    }
  };

  const types: TplType[] = ['cart_item_added', 'cart_item_removed', 'order_paid', 'tracking_code', 'waitlist'];
  if (loading) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-4">
      {types.map((type) => {
        const t = tpls[type] || {};
        return (
          <Card key={type}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">{TPL_LABEL[type]}</CardTitle>
                <div className="text-xs text-muted-foreground mt-1">Variáveis: {TPL_VARS[type].join(' ')}</div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">{t.is_enabled ? 'Push ativo' : 'Cai no WhatsApp'}</Label>
                <Switch checked={!!t.is_enabled} onCheckedChange={(v) => save(type, { is_enabled: v })} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Título</Label>
                <Input value={t.title || ''} onChange={(e) => save(type, { title: e.target.value })} placeholder="Título da notificação" />
              </div>
              <div>
                <Label className="text-xs">Mensagem</Label>
                <Textarea value={t.body || ''} onChange={(e) => save(type, { body: e.target.value })} placeholder="Corpo da mensagem" rows={2} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Imagem (URL) — opcional</Label>
                  <Input value={t.image_url || ''} onChange={(e) => save(type, { image_url: e.target.value })} placeholder="https://…" />
                </div>
                <div>
                  <Label className="text-xs">Link ao clicar — opcional</Label>
                  <Input value={t.click_url || ''} onChange={(e) => save(type, { click_url: e.target.value })} placeholder="/pedidos ou https://…" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ================= Campaign ================= */
const BR_UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function CampaignTab({ tenantId }: { tenantId?: string }) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [clickUrl, setClickUrl] = useState('');
  const [audience, setAudience] = useState<'all' | 'paid' | 'unpaid' | 'buyers'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [states, setStates] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const toggleState = (uf: string) => {
    setStates((prev) => prev.includes(uf) ? prev.filter((s) => s !== uf) : [...prev, uf]);
  };

  const loadCampaigns = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from('push_campaigns').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(30);
    setCampaigns(data || []);
  };
  useEffect(() => { loadCampaigns(); }, [tenantId]);

  const send = async () => {
    if (!tenantId) return;
    if (!title.trim() || !body.trim()) { toast({ title: 'Preencha título e mensagem', variant: 'destructive' }); return; }
    setSending(true);
    const { data, error } = await supabase.functions.invoke('push-send-campaign', {
      body: {
        tenant_id: tenantId, title, body,
        image_url: imageUrl || null, click_url: clickUrl || null,
        audience,
        states: states.length ? states : null,
        date_from: (audience === 'paid' || audience === 'unpaid') && dateFrom ? dateFrom : null,
        date_to: (audience === 'paid' || audience === 'unpaid') && dateTo ? dateTo : null,
      },
    });
    setSending(false);
    if (error || (data as any)?.success === false) {
      toast({ title: 'Falha no envio', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Campanha enviada', description: `Alvos: ${(data as any).targets} • Enviados: ${(data as any).sent} • Falhas: ${(data as any).failed}` });
    setTitle(''); setBody(''); setImageUrl(''); setClickUrl('');
    loadCampaigns();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Nova campanha</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: 🔥 Novidade!" maxLength={100} />
          </div>
          <div>
            <Label className="text-xs">Mensagem</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="O que você quer avisar?" rows={3} maxLength={300} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Imagem (URL) — opcional</Label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Link ao clicar — opcional</Label>
              <Input value={clickUrl} onChange={(e) => setClickUrl(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Público</Label>
            <RadioGroup value={audience} onValueChange={(v) => setAudience(v as any)} className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="flex items-center gap-2"><RadioGroupItem id="all" value="all" /><Label htmlFor="all">Todos os cadastrados</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem id="buyers" value="buyers" /><Label htmlFor="buyers">Só clientes que já compraram</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem id="paid" value="paid" /><Label htmlFor="paid">Clientes com pedido pago</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem id="unpaid" value="unpaid" /><Label htmlFor="unpaid">Clientes com pedido não pago</Label></div>
            </RadioGroup>
          </div>

          {(audience === 'paid' || audience === 'unpaid') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <div>
                <Label className="text-xs">Data inicial (opcional)</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Data final (opcional)</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="md:col-span-2 text-[11px] text-muted-foreground">
                Filtra clientes pelo período em que o pedido foi criado. Deixe em branco para considerar todo o histórico.
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Estados (opcional)</Label>
              {states.length > 0 && (
                <button type="button" className="text-[11px] text-[#4f46e5] hover:underline" onClick={() => setStates([])}>
                  Limpar seleção
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BR_UFS.map((uf) => {
                const active = states.includes(uf);
                return (
                  <button
                    key={uf}
                    type="button"
                    onClick={() => toggleState(uf)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${active ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#4f46e5]/40'}`}
                  >
                    {uf}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5">
              {states.length === 0 ? 'Nenhum estado selecionado — envia para todas as regiões.' : `Enviando apenas para: ${states.join(', ')}`}
            </div>
          </div>
          <Button onClick={send} disabled={sending} className="bg-[#4f46e5] hover:bg-[#4338ca]">
            <Send className="h-4 w-4 mr-2" />{sending ? 'Enviando…' : 'Enviar campanha'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de campanhas</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr><th className="py-2">Data</th><th>Título</th><th>Público</th><th>Alvos</th><th>Enviados</th><th>Falhas</th><th>Cliques</th></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2 text-xs">{formatBrasiliaDate(c.created_at)}</td>
                    <td>{c.title}</td>
                    <td className="text-xs">{c.audience}</td>
                    <td>{c.total_targets}</td>
                    <td className="text-emerald-700">{c.total_sent}</td>
                    <td className="text-red-600">{c.total_failed}</td>
                    <td>{c.total_clicked}</td>
                  </tr>
                ))}
                {campaigns.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Nenhuma campanha ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ================= Reports ================= */
function ReportsTab({ tenantId }: { tenantId?: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [subCount, setSubCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: l }, { count }] = await Promise.all([
      supabase.from('push_notifications_log').select('*').eq('tenant_id', tenantId).gte('created_at', since).order('created_at', { ascending: false }).limit(2000),
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true),
    ]);
    setLogs(l || []);
    setSubCount(count || 0);
    setLoading(false);
  };
  useEffect(() => { load(); }, [tenantId]);

  const stats = useMemo(() => {
    const now = Date.now();
    const in7 = logs.filter((x) => now - new Date(x.created_at).getTime() <= 7 * 864e5);
    const sent = logs.filter((x) => x.status === 'sent' || x.status === 'clicked').length;
    const failed = logs.filter((x) => x.status === 'failed').length;
    const clicked = logs.filter((x) => x.status === 'clicked').length;
    const rate = sent > 0 ? Math.round((clicked / sent) * 100) : 0;
    const failRate = logs.length > 0 ? Math.round((failed / logs.length) * 100) : 0;

    const byDay: Record<string, number> = {};
    for (const x of logs) {
      const d = new Date(x.created_at).toISOString().slice(0, 10);
      byDay[d] = (byDay[d] || 0) + 1;
    }
    const byTemplate: Record<string, { sent: number; clicked: number }> = {};
    for (const x of logs) {
      if (!x.template_type) continue;
      const k = x.template_type;
      byTemplate[k] = byTemplate[k] || { sent: 0, clicked: 0 };
      if (x.status === 'sent' || x.status === 'clicked') byTemplate[k].sent++;
      if (x.status === 'clicked') byTemplate[k].clicked++;
    }
    return { sent7: in7.length, sent30: logs.length, clickRate: rate, failRate, byDay, byTemplate };
  }, [logs]);

  const maxDay = Math.max(1, ...Object.values(stats.byDay));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Assinantes ativos" value={subCount} />
        <StatCard label="Envios (7d)" value={stats.sent7} />
        <StatCard label="Envios (30d)" value={stats.sent30} />
        <StatCard label="Taxa de clique" value={`${stats.clickRate}%`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Envios por dia (30d)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-40">
            {Object.entries(stats.byDay).sort().slice(-30).map(([d, v]) => (
              <div key={d} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-indigo-500/80 rounded-t" style={{ height: `${(v / maxDay) * 100}%` }} title={`${d}: ${v}`} />
                <div className="text-[9px] text-muted-foreground">{d.slice(5)}</div>
              </div>
            ))}
            {Object.keys(stats.byDay).length === 0 && <div className="text-sm text-muted-foreground w-full text-center">Sem dados no período.</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Por template</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b">
              <tr><th className="py-2">Template</th><th>Enviados</th><th>Cliques</th><th>CTR</th></tr>
            </thead>
            <tbody>
              {Object.entries(stats.byTemplate).map(([t, v]) => (
                <tr key={t} className="border-b">
                  <td className="py-2">{TPL_LABEL[t as TplType] || t}</td>
                  <td>{v.sent}</td>
                  <td>{v.clicked}</td>
                  <td>{v.sent ? Math.round((v.clicked / v.sent) * 100) : 0}%</td>
                </tr>
              ))}
              {Object.keys(stats.byTemplate).length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sem envios automáticos ainda.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">Taxa de falha nos últimos 30 dias: {stats.failRate}%.</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: any }) {
  return (
    <Card><CardContent className="pt-5 pb-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
    </CardContent></Card>
  );
}
