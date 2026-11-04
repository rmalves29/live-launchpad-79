import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Check, Ban, Wallet, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminLeadsTab } from '@/components/affiliates/AdminLeadsTab';

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AdminAfiliados() {
  const { confirm, confirmDialogElement } = useConfirmDialog();
  const [affs, setAffs] = useState<any[]>([]);
  const [rank, setRank] = useState<Record<string, any>>({});
  const [released, setReleased] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [edit, setEdit] = useState<Record<string, { p: string; m: string }>>({});
  const [payFor, setPayFor] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [paying, setPaying] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, r, c, s] = await Promise.all([
      supabase.from('platform_affiliates' as any).select('*').order('created_at', { ascending: false }),
      supabase.rpc('platform_affiliate_ranking' as any),
      supabase.from('platform_affiliate_commissions' as any).select('id, affiliate_id, valor_comissao, created_at').eq('status', 'liberada'),
      supabase.from('platform_affiliate_settings' as any).select('*').eq('id', 1).maybeSingle(),
    ]);
    setAffs((a.data as any) || []);
    setRank(Object.fromEntries(((r.data as any) || []).map((x: any) => [x.affiliate_id, x])));
    setReleased((c.data as any) || []);
    setSettings(s.data);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const update = async (id: string, patch: any, ok: string) => {
    const { error } = await supabase.from('platform_affiliates' as any).update(patch).eq('id', id);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: ok });
    if (!error) load();
  };

  const saveTerms = (a: any) => {
    const e = edit[a.id]; if (!e) return;
    const p = Number(e.p.replace(',', '.'));
    if (!(p >= 0 && p <= 100)) return setMsg({ ok: false, text: 'Percentual deve ficar entre 0 e 100' });
    const m = e.m.trim() === '' ? null : parseInt(e.m, 10);
    if (m !== null && !(m > 0)) return setMsg({ ok: false, text: 'Duração deve ser maior que zero ou vazia (sem limite)' });
    update(a.id, { commission_percent: p, commission_months: m }, `Comissão de ${a.nome} atualizada.`);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const { error } = await supabase.from('platform_affiliate_settings' as any).update({
        affiliate_whatsapp: (settings.affiliate_whatsapp || '').replace(/\D/g, '') || null,
        default_percent: Number(settings.default_percent), default_months: settings.default_months ? Number(settings.default_months) : null,
        min_payout: Number(settings.min_payout), plan_price: Number(String(settings.plan_price ?? 299).replace(',', '.')) || 299,
        fallback_payment_url: (settings.fallback_payment_url || '').trim() || null, updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) {
        setMsg({ ok: false, text: error.message });
        toast.error(error.message);
      } else {
        setMsg({ ok: true, text: 'Configurações salvas.' });
        toast.success('Configurações salvas');
        // recarrega do banco para refletir exatamente o que foi gravado
        const { data } = await supabase.from('platform_affiliate_settings' as any).select('*').eq('id', 1).maybeSingle();
        setSettings(data);
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const byAff = useMemo(() => {
    const m: Record<string, number> = {};
    released.forEach((c) => { m[c.affiliate_id] = (m[c.affiliate_id] || 0) + Number(c.valor_comissao); });
    return m;
  }, [released]);

  const ranking = useMemo(() => [...affs].sort((a, b) => Number(rank[b.id]?.comissao_total || 0) - Number(rank[a.id]?.comissao_total || 0)), [affs, rank]);

  const registerPayout = async () => {
    if (!payFor) return;
    setPaying(true); setMsg(null);
    try {
      let url: string | null = null;
      if (file) {
        const path = `${payFor.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('affiliate-payouts').upload(path, file);
        if (upErr) throw upErr;
        url = path;
      }
      const { data, error } = await supabase.rpc('platform_affiliate_register_payout' as any, { _affiliate_id: payFor.id, _comprovante_url: url });
      if (error) throw error;
      setMsg({ ok: true, text: `Pagamento de ${brl((data as any)?.valor)} registrado para ${payFor.nome}.` });
      setPayFor(null); setFile(null); load();
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Erro ao registrar' }); } finally { setPaying(false); }
  };

  if (loading) return <div className="p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const min = Number(settings?.min_payout || 50);

  return (
    <div className="mx-auto max-w-[1600px] p-4 md:p-6 space-y-6">
      {confirmDialogElement}
      <div>
        <h1 className="text-2xl font-bold">Afiliados da plataforma</h1>
        <p className="text-sm text-muted-foreground">Link público: /i/CODIGO · cadastro: /afiliados/cadastro · landing: /indicacao</p>
      </div>
      {msg && <Alert variant={msg.ok ? 'default' : 'destructive'}><AlertDescription>{msg.text}</AlertDescription></Alert>}

      <Tabs defaultValue="afiliados" className="space-y-6">
      <TabsList>
        <TabsTrigger value="afiliados">Afiliados</TabsTrigger>
        <TabsTrigger value="leads">Leads e reuniões</TabsTrigger>
      </TabsList>
      <TabsContent value="leads"><AdminLeadsTab affiliates={affs} /></TabsContent>
      <TabsContent value="afiliados" className="space-y-6">

      {settings && (
        <section className="rounded-xl border bg-card p-4 grid gap-3 md:grid-cols-5 items-end">
          <div className="md:col-span-2"><Label>WhatsApp da landing (com DDI)</Label><Input value={settings.affiliate_whatsapp || ''} placeholder="5511999999999" onChange={(e) => setSettings({ ...settings, affiliate_whatsapp: e.target.value })} /></div>
          <div><Label>% padrão (novos)</Label><Input value={settings.default_percent} onChange={(e) => setSettings({ ...settings, default_percent: e.target.value })} /></div>
          <div><Label>Saque mínimo (R$)</Label><Input value={settings.min_payout} onChange={(e) => setSettings({ ...settings, min_payout: e.target.value })} /></div>
          <div><Label>Valor do plano (R$)</Label><Input value={settings.plan_price ?? 299} onChange={(e) => setSettings({ ...settings, plan_price: e.target.value })} /></div>
          <div className="md:col-span-3"><Label>Link fixo de pagamento (reserva, se o link por empresa falhar)</Label><Input value={settings.fallback_payment_url || ''} placeholder="https://payment-link-v3.pagar.me/..." onChange={(e) => setSettings({ ...settings, fallback_payment_url: e.target.value })} /></div>
          <Button onClick={saveSettings} disabled={savingSettings}>{savingSettings ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}{savingSettings ? 'Salvando...' : 'Salvar'}</Button>
        </section>
      )}

      <section className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>{['Afiliado', 'Status', 'Cliques', 'Leads', 'Clientes', 'MRR indicado', 'Comissão total', '% / meses', 'Liberado', ''].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {ranking.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Nenhum afiliado ainda.</td></tr>}
            {ranking.map((a) => {
              const r = rank[a.id] || {};
              const e = edit[a.id] ?? { p: String(a.commission_percent), m: a.commission_months ? String(a.commission_months) : '' };
              const saldo = byAff[a.id] || 0;
              return (
                <tr key={a.id} className="border-t align-top">
                  <td className="p-3"><div className="font-medium">{a.nome} <span className="text-muted-foreground">({a.codigo})</span></div><div className="text-muted-foreground">{a.email} · {a.telefone || '-'}</div><div className="text-muted-foreground">PIX: {a.pix_key || '—'}</div></td>
                  <td className="p-3"><Badge variant={a.status === 'aprovado' ? 'default' : a.status === 'bloqueado' ? 'destructive' : 'secondary'}>{a.status}</Badge></td>
                  <td className="p-3">{r.cliques ?? 0}</td>
                  <td className="p-3">{r.leads ?? 0}</td>
                  <td className="p-3">{r.clientes_ativos ?? 0}/{r.clientes ?? 0}</td>
                  <td className="p-3">{brl(r.mrr)}</td>
                  <td className="p-3">{brl(r.comissao_total)}</td>
                  <td className="p-3">
                    <div className="flex gap-1 items-center">
                      <Input className="w-16 h-8" value={e.p} onChange={(ev) => setEdit({ ...edit, [a.id]: { ...e, p: ev.target.value } })} />
                      <Input className="w-16 h-8" placeholder="∞" value={e.m} onChange={(ev) => setEdit({ ...edit, [a.id]: { ...e, m: ev.target.value } })} />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveTerms(a)}><Save className="h-4 w-4" /></Button>
                    </div>
                  </td>
                  <td className="p-3 font-medium">{brl(saldo)}</td>
                  <td className="p-3 space-y-1 whitespace-nowrap">
                    {a.status !== 'aprovado' && <Button size="sm" onClick={() => update(a.id, { status: 'aprovado' }, `${a.nome} aprovado.`)}><Check className="h-4 w-4 mr-1" />Aprovar</Button>}
                    {a.status !== 'bloqueado' && <Button size="sm" variant="outline" onClick={async () => { if (await confirm({ title: `Bloquear ${a.nome}?`, description: 'Novos pagamentos deixam de gerar comissão.' })) update(a.id, { status: 'bloqueado' }, `${a.nome} bloqueado.`); }}><Ban className="h-4 w-4 mr-1" />Bloquear</Button>}
                    {saldo > 0 && <Button size="sm" variant="secondary" disabled={saldo < min} title={saldo < min ? `Abaixo do mínimo de ${brl(min)}` : ''} onClick={() => setPayFor(a)}><Wallet className="h-4 w-4 mr-1" />Registrar pagamento PIX</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      </TabsContent>
      </Tabs>

      <Dialog open={!!payFor} onOpenChange={(o) => { if (!o) { setPayFor(null); setFile(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pagamento PIX</DialogTitle></DialogHeader>
          {payFor && (
            <div className="space-y-3 text-sm">
              <p><strong>{payFor.nome}</strong> · PIX: {payFor.pix_key || 'sem chave cadastrada'}</p>
              <p>Valor: <strong>{brl(byAff[payFor.id] || 0)}</strong> ({released.filter((c) => c.affiliate_id === payFor.id).length} comissões liberadas)</p>
              <div><Label>Comprovante (opcional)</Label><Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>Cancelar</Button>
            <Button onClick={registerPayout} disabled={paying}>{paying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar pagamento'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
