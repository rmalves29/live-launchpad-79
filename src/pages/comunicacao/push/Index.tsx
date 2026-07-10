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

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 pt-7">
        <div className="flex items-center gap-3 mb-1.5">
          <Bell className="h-7 w-7 text-[#4f46e5]" />
          <h1 className="text-[24px] font-bold text-slate-900">Notificações Push</h1>
        </div>
        <p className="text-slate-500 text-[13px] mb-5">Assinantes, templates, campanhas e relatórios em um só lugar.</p>
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

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => (r.name || '').toLowerCase().includes(s) || (r.phone || '').includes(s) || (r.instagram_handle || '').toLowerCase().includes(s));
  }, [rows, q]);

  const remove = async (id: number) => {
    await supabase.from('push_subscriptions').delete().eq('id', id);
    toast({ title: 'Assinante removido' });
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Assinantes ({rows.length})</CardTitle>
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
                <tr><th className="py-2">Nome</th><th>Telefone</th><th>@Instagram</th><th>Dispositivo</th><th>Ativa</th><th>Cadastro</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="py-2">{r.name || '—'}</td>
                    <td>{r.phone || '—'}</td>
                    <td>{r.instagram_handle ? `@${r.instagram_handle}` : '—'}</td>
                    <td className="max-w-[220px] truncate text-xs text-muted-foreground">{r.user_agent || '—'}</td>
                    <td>{r.is_active ? <Badge variant="outline" className="border-emerald-300 text-emerald-700">Sim</Badge> : <Badge variant="outline">Não</Badge>}</td>
                    <td className="text-xs">{formatBrasiliaDate(r.created_at)}</td>
                    <td><Button variant="ghost" size="sm" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button></td>
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
function CampaignTab({ tenantId }: { tenantId?: string }) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [clickUrl, setClickUrl] = useState('');
  const [audience, setAudience] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [sending, setSending] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);

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
      body: { tenant_id: tenantId, title, body, image_url: imageUrl || null, click_url: clickUrl || null, audience },
    });
    setSending(false);
    if (error || (data as any)?.success === false) {
      toast({ title: 'Falha no envio', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Campanha enviada', description: `Enviados: ${(data as any).sent} / Falhas: ${(data as any).failed}` });
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
            <RadioGroup value={audience} onValueChange={(v) => setAudience(v as any)} className="flex gap-6">
              <div className="flex items-center gap-2"><RadioGroupItem id="all" value="all" /><Label htmlFor="all">Todos os cadastrados</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem id="paid" value="paid" /><Label htmlFor="paid">Só clientes pagos</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem id="unpaid" value="unpaid" /><Label htmlFor="unpaid">Só clientes não pagos</Label></div>
            </RadioGroup>
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
