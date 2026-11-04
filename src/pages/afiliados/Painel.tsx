import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Loader2, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import cartzyLogo from '@/assets/cartzy-logo.png';
import { IndicateDialog } from '@/components/affiliates/IndicateDialog';
import { LEAD_STATUS } from '@/components/affiliates/lead-status';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const SITE = 'https://app.cartzy.com.br';

export default function AfiliadoPainel() {
  const { signOut } = useAuth();
  // Sessão lida direto do cliente: logo após o login o contexto global pode ainda não ter o usuário
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const read = async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user ?? null;
      const prof = u ? (await supabase.from('profiles').select('role').eq('id', u.id).maybeSingle()).data : null;
      if (alive) { setUser(u); setProfile(prof); setIsLoading(false); }
    };
    read();
    const { data: sub } = supabase.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') read(); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  const [aff, setAff] = useState<any>(null);
  const [clicks, setClicks] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [comms, setComms] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [minPayout, setMinPayout] = useState(50);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [pix, setPix] = useState('');
  const [pixMsg, setPixMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [a, c, l, m, p, cl] = await Promise.all([
      supabase.from('platform_affiliates' as any).select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('platform_affiliate_clicks' as any).select('created_at').gte('created_at', since),
      supabase.from('platform_affiliate_leads' as any).select('id, nome, empresa, status, meeting_at, created_at, tenant_id, origem').order('created_at', { ascending: false }),
      supabase.from('platform_affiliate_commissions' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('platform_affiliate_payouts' as any).select('*').order('paid_at', { ascending: false }),
      supabase.rpc('my_platform_affiliate_clients' as any),
    ]);
    setAff(a.data); setPix((a.data as any)?.pix_key || '');
    setClicks((c.data as any) || []); setLeads((l.data as any) || []); setComms((m.data as any) || []);
    setPayouts((p.data as any) || []); setClients((cl.data as any) || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { if (user && profile?.role === 'affiliate') load(); }, [user, profile?.role, load]);

  const stats = useMemo(() => {
    const d7 = Date.now() - 7 * 864e5;
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    const monthComms = comms.filter((c) => new Date(c.created_at) >= month);
    const sum = (arr: any[], st: string) => arr.filter((c) => c.status === st).reduce((s, c) => s + Number(c.valor_comissao), 0);
    return {
      c7: clicks.filter((c) => new Date(c.created_at).getTime() >= d7).length,
      c30: clicks.length,
      ativos: clients.filter((c) => c.ativo).length,
      mes: { pendente: sum(monthComms, 'pendente'), liberada: sum(monthComms, 'liberada'), paga: sum(monthComms, 'paga'), cancelada: sum(monthComms, 'cancelada') },
      saldo: sum(comms, 'liberada'),
      pendenteTotal: sum(comms, 'pendente'),
    };
  }, [clicks, comms, clients]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (profile && profile.role !== 'affiliate') return <Navigate to="/" replace />;

  const link = aff ? `${SITE}/i/${aff.codigo}` : '';
  const copy = async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const savePix = async () => {
    setPixMsg(null);
    const { data } = await supabase.functions.invoke('platform-affiliates', { body: { action: 'update_pix', pix_key: pix } });
    setPixMsg(data?.success ? 'Chave PIX salva.' : data?.error || 'Erro ao salvar');
    if (data?.success) load();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between">
          <img src={cartzyLogo} alt="Cartzy" className="h-7 w-auto" />
          <Button variant="ghost" size="sm" onClick={() => signOut()}><LogOut className="h-4 w-4 mr-1" />Sair</Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6 space-y-6">
        {loading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : !aff ? (
          <p className="text-muted-foreground">Cadastro de afiliado não encontrado.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Olá, {aff.nome.split(' ')[0]}!</h1>
              <Badge variant={aff.status === 'aprovado' ? 'default' : aff.status === 'bloqueado' ? 'destructive' : 'secondary'}>{aff.status}</Badge>
            </div>
            {aff.status === 'pendente' && <p className="text-sm text-muted-foreground">Seu cadastro está em análise. O link começa a contar depois da aprovação.</p>}

            <section className="rounded-2xl border bg-card p-5 flex flex-col md:flex-row gap-5 items-center">
              <div className="rounded-xl bg-background p-3 border"><QRCodeSVG value={link} size={132} /></div>
              <div className="flex-1 w-full space-y-2">
                <Label>Seu link de indicação</Label>
                <div className="flex gap-2"><Input readOnly value={link} /><Button onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div>
                <p className="text-sm text-muted-foreground">Comissão: {aff.commission_percent}% de cada mensalidade{aff.commission_months ? ` por ${aff.commission_months} meses` : ', enquanto a cliente pagar'}. Liberada 30 dias após o pagamento.</p>
              </div>
            </section>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[['Cliques 7 dias', stats.c7], ['Cliques 30 dias', stats.c30], ['Leads', leads.length], ['Clientes ativos', stats.ativos]].map(([k, v]) => (
                <div key={k as string} className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">{k}</div><div className="text-2xl font-bold">{v}</div></div>
              ))}
            </section>

            <section className="grid md:grid-cols-2 gap-3">
              <div className="rounded-xl border bg-card p-4 space-y-1">
                <div className="font-semibold mb-2">Comissões do mês</div>
                {(['pendente', 'liberada', 'paga', 'cancelada'] as const).map((s) => (
                  <div key={s} className="flex justify-between text-sm"><span className="capitalize">{s}</span><span>{brl(stats.mes[s])}</span></div>
                ))}
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="text-sm text-muted-foreground">Saldo liberado para saque</div>
                <div className="text-3xl font-bold text-primary">{brl(stats.saldo)}</div>
                <div className="text-sm text-muted-foreground mt-1">Em carência: {brl(stats.pendenteTotal)} · saque mínimo {brl(minPayout)} · pagamento mensal por PIX</div>
              </div>
            </section>

            <section className="rounded-xl border bg-card p-4 space-y-2">
              <Label>Chave PIX</Label>
              <div className="flex gap-2"><Input value={pix} onChange={(e) => setPix(e.target.value)} /><Button onClick={savePix}>Salvar</Button></div>
              {pixMsg && <p className="text-sm text-muted-foreground">{pixMsg}</p>}
            </section>

            <section className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Minhas indicações</div>
                <IndicateDialog disabled={aff.status !== 'aprovado'} onDone={load} />
              </div>
              {leads.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma indicação ainda.</p> : leads.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm py-2 border-b last:border-0">
                  <span><strong>{l.empresa || l.nome}</strong>{l.empresa ? <span className="text-muted-foreground"> · {l.nome}</span> : null}</span>
                  <span className="flex items-center gap-2">
                    {l.meeting_at && l.status === 'reuniao_agendada' && <span className="text-muted-foreground">{new Date(l.meeting_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                    <Badge variant={l.status === 'perdido' ? 'secondary' : l.status === 'pagando' || l.status === 'fechado' ? 'default' : 'outline'}>{LEAD_STATUS[l.status] || l.status}</Badge>
                  </span>
                </div>
              ))}
            </section>

            <section className="rounded-xl border bg-card p-4">
              <div className="font-semibold mb-2">Contratações diretas pelo seu link</div>
              {leads.filter((l) => l.origem === 'self_signup').length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ainda.</p> : leads.filter((l) => l.origem === 'self_signup').map((l) => {
                const paid = ['fechado', 'pagando'].includes(l.status);
                const total = comms.filter((c) => c.tenant_id && c.tenant_id === l.tenant_id && c.status !== 'cancelada').reduce((acc, c) => acc + Number(c.valor_comissao || 0), 0);
                return (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm py-2 border-b last:border-0">
                    <span><strong>{l.empresa || l.nome}</strong> <span className="text-muted-foreground">· {new Date(l.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">Comissão: {brl(total)}</span>
                      <Badge variant={paid ? 'default' : l.status === 'expirado' ? 'secondary' : 'outline'}>{paid ? 'Pago' : l.status === 'expirado' ? 'Expirado' : 'Aguardando pagamento'}</Badge>
                    </span>
                  </div>
                );
              })}
            </section>

            <section className="rounded-xl border bg-card p-4">
              <div className="font-semibold mb-2">Clientes indicados</div>
              {clients.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum ainda.</p> : clients.map((c, i) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{c.name}</span><Badge variant={c.ativo ? 'default' : 'secondary'}>{c.ativo ? 'ativa' : 'inativa'}</Badge></div>
              ))}
            </section>

            <section className="rounded-xl border bg-card p-4">
              <div className="font-semibold mb-2">Histórico de pagamentos</div>
              {payouts.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pagamento ainda.</p> : payouts.map((p) => (
                <div key={p.id} className="flex justify-between text-sm py-1 border-b last:border-0">
                  <span>{new Date(p.paid_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span><span>{brl(Number(p.valor))}</span>
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
