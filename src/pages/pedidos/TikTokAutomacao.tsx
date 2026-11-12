import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Eye, EyeOff, Loader2, Music2, Radio, Square } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

// Painel da automação de live do TikTok (teste na OrderZap).
// O programa "tiktok-live-reader" (no computador da loja) lê os comentários e manda para a edge function
// tiktok-live-comment. Aqui a apresentadora vê, em tempo real, quem comentou e ainda não cadastrou o
// WhatsApp (para chamar pelo nome na live) e, ao encerrar, a lista de repescagem.

interface Settings { tenant_id: string; enabled: boolean; reader_key: string; reserve_hours: number }
interface Session { id: string; tiktok_live_username: string; status: string; started_at: string; ended_at: string | null; last_comment_at: string | null }
interface CommentRow {
  id: number; session_id: string; tiktok_username: string; comment_text: string | null; product_code: string | null;
  product_name: string | null; qty: number; status: string; order_id: number | null; expires_at: string | null; created_at: string;
}

const db = supabase as any;

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  added: { label: 'Pedido + WhatsApp', variant: 'default' },
  pendente: { label: 'Sem cadastro', variant: 'destructive' },
  confirmado: { label: 'Cadastrou', variant: 'default' },
  expirado: { label: 'Reserva expirou', variant: 'outline' },
  out_of_stock: { label: 'Esgotado', variant: 'secondary' },
  not_found: { label: 'Código não existe', variant: 'secondary' },
  not_for_live: { label: 'Não é da live', variant: 'secondary' },
  blocked: { label: 'Cliente bloqueada', variant: 'outline' },
};

function timeLeft(expiresAt: string | null, now: number) {
  if (!expiresAt) return '—';
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return 'vencendo';
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`;
}

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado`)).catch(() => toast.error('Não foi possível copiar'));
}

export default function TikTokAutomacao() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;
  const cadastroUrl = tenant?.slug ? `https://app.cartzy.com.br/t/${tenant.slug}/cadastro-tiktok` : '';

  const [settings, setSettings] = useState<Settings | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [hours, setHours] = useState('3');
  const [savingHours, setSavingHours] = useState(false);
  const [ending, setEnding] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!tenantId) return;
    const [{ data: s }, { data: sess }] = await Promise.all([
      db.from('tiktok_live_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
      db.from('tiktok_live_sessions').select('*').eq('tenant_id', tenantId).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setSettings((prev) => {
      if (!prev && s) setHours(String(s.reserve_hours));
      return s ?? null;
    });
    setSession(sess ?? null);
    if (sess) {
      const { data: rows } = await db.from('tiktok_live_comments').select('*')
        .eq('tenant_id', tenantId).eq('session_id', sess.id)
        .order('created_at', { ascending: false }).limit(500);
      setComments(rows ?? []);
    } else {
      setComments([]);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    const c = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [load]);

  const isLive = session?.status === 'ativa';

  // Pendentes: uma linha por @ (soma os códigos que ela comentou sem cadastro).
  const pending = useMemo(() => {
    const map = new Map<string, { username: string; codes: string[]; expiresAt: string | null }>();
    for (const c of comments) {
      if (c.status !== 'pendente') continue;
      const e = map.get(c.tiktok_username) || { username: c.tiktok_username, codes: [], expiresAt: null };
      e.codes.push(c.qty > 1 ? `${c.product_code} (${c.qty}x)` : String(c.product_code));
      if (!e.expiresAt || (c.expires_at && c.expires_at > e.expiresAt)) e.expiresAt = c.expires_at;
      map.set(c.tiktok_username, e);
    }
    return [...map.values()];
  }, [comments]);

  // Repescagem: quem pediu na live e não cadastrou (pendente ou reserva vencida).
  const repescagem = useMemo(() => {
    const confirmed = new Set(comments.filter((c) => c.status === 'confirmado' || c.status === 'added').map((c) => c.tiktok_username));
    const map = new Map<string, string[]>();
    for (const c of comments) {
      if ((c.status === 'pendente' || c.status === 'expirado') && !confirmed.has(c.tiktok_username)) {
        map.set(c.tiktok_username, [...(map.get(c.tiktok_username) || []), String(c.product_code)]);
      }
    }
    return [...map.entries()].map(([username, codes]) => ({ username, codes }));
  }, [comments]);

  const counts = useMemo(() => ({
    pedidos: comments.filter((c) => c.status === 'added' || c.status === 'confirmado').length,
    pendentes: comments.filter((c) => c.status === 'pendente').length,
    esgotados: comments.filter((c) => c.status === 'out_of_stock').length,
  }), [comments]);

  const callText = (u: string, codes: string[]) =>
    `@${u}, seu ${codes.join(', ')} está separado! Cadastra seu WhatsApp no link da bio pra garantir 💖`;
  const dmText = (u: string, codes: string[]) =>
    `Oi @${u}! Vi que você pediu ${codes.join(', ')} na nossa live 💖 Pra garantir, é só cadastrar seu WhatsApp aqui (leva 1 minuto): ${cadastroUrl}`;

  const saveHours = async () => {
    const n = Math.min(Math.max(parseInt(hours) || 3, 1), 48);
    setSavingHours(true);
    const { error } = await db.from('tiktok_live_settings').update({ reserve_hours: n, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId);
    setSavingHours(false);
    if (error) toast.error('Só o administrador da empresa pode alterar');
    else { toast.success(`Reserva de ${n}h salva`); setHours(String(n)); load(); }
  };

  const endSession = async () => {
    if (!session) return;
    setEnding(true);
    const { error } = await db.from('tiktok_live_sessions').update({ status: 'encerrada', ended_at: new Date().toISOString() }).eq('id', session.id);
    setEnding(false);
    if (error) toast.error('Não foi possível encerrar');
    else { toast.success('Live encerrada. Veja a repescagem abaixo.'); load(); }
  };

  if (loading) {
    return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  // A configuração (com a chave) só o administrador lê; a equipe vê o painel da live mesmo assim.
  if (!settings?.enabled && !session) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card><CardContent className="pt-6 text-muted-foreground">A automação de live do TikTok ainda não está ligada para esta empresa.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Music2 className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Automação de live TikTok</h1>
        </div>
        {session && (
          <div className="flex items-center gap-2">
            {isLive
              ? <Badge className="gap-1"><Radio className="h-3 w-3" /> Ao vivo · @{session.tiktok_live_username}</Badge>
              : <Badge variant="outline">Última live: @{session.tiktok_live_username} (encerrada)</Badge>}
            {isLive && (
              <Button size="sm" variant="destructive" onClick={endSession} disabled={ending}>
                {ending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Square className="h-4 w-4 mr-1" />}Encerrar live
              </Button>
            )}
          </div>
        )}
      </div>

      {!session && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">
          Nenhuma live ainda. No computador, abra o <b>iniciar.bat</b> da pasta <b>tiktok-live-reader</b> e digite o @ da conta que está ao vivo.
        </CardContent></Card>
      )}

      {session && (
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Pedidos lançados</div><div className="text-2xl font-bold">{counts.pedidos}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Sem cadastro</div><div className="text-2xl font-bold text-destructive">{counts.pendentes}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Esgotados</div><div className="text-2xl font-bold">{counts.esgotados}</div></CardContent></Card>
        </div>
      )}

      {session && isLive && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Chamar na live: comentou e não cadastrou</CardTitle></CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém pendente agora.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>@ da cliente</TableHead><TableHead>Pediu</TableHead><TableHead>Reserva</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {pending.map((p) => (
                    <TableRow key={p.username}>
                      <TableCell className="font-semibold">@{p.username}</TableCell>
                      <TableCell>{p.codes.join(', ')}</TableCell>
                      <TableCell>{timeLeft(p.expiresAt, now)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => copy(callText(p.username, p.codes), 'Chamada')}><Copy className="h-4 w-4 mr-1" />Frase</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {session && !isLive && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Repescagem: mandar direct no TikTok</CardTitle></CardHeader>
          <CardContent>
            {repescagem.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todo mundo que pediu está cadastrado.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>@ da cliente</TableHead><TableHead>Pediu</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {repescagem.map((r) => (
                    <TableRow key={r.username}>
                      <TableCell className="font-semibold">@{r.username}</TableCell>
                      <TableCell>{r.codes.join(', ')}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => copy(dmText(r.username, r.codes), 'Mensagem')}><Copy className="h-4 w-4 mr-1" />Mensagem</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {session && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Comentários com código</CardTitle></CardHeader>
          <CardContent>
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum código comentado ainda.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Hora</TableHead><TableHead>@</TableHead><TableHead>Comentário</TableHead><TableHead>Produto</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {comments.slice(0, 100).map((c) => {
                      const st = STATUS_LABEL[c.status] || { label: c.status, variant: 'secondary' as const };
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                          <TableCell>@{c.tiktok_username}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{c.comment_text}</TableCell>
                          <TableCell>{c.product_name || c.product_code}{c.order_id ? <span className="text-xs text-muted-foreground"> · #{c.order_id}</span> : null}</TableCell>
                          <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {settings && (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Configuração</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-1">
            <div className="font-medium">Link de cadastro (coloque na bio do TikTok)</div>
            <div className="flex gap-2">
              <Input readOnly value={cadastroUrl} />
              <Button variant="outline" onClick={() => copy(cadastroUrl, 'Link')}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="space-y-1">
            <div className="font-medium">Chave do programa leitor (cole no tiktok-live-reader na primeira vez)</div>
            <div className="flex gap-2">
              <Input readOnly type={showKey ? 'text' : 'password'} value={settings.reader_key} />
              <Button variant="outline" onClick={() => setShowKey((v) => !v)}>{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
              <Button variant="outline" onClick={() => copy(settings.reader_key, 'Chave')}><Copy className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Não compartilhe: quem tem a chave consegue lançar pedidos nesta empresa.</p>
          </div>
          <div className="space-y-1">
            <div className="font-medium">Prazo da reserva para quem não tem cadastro (horas)</div>
            <div className="flex gap-2 max-w-xs">
              <Input type="number" min={1} max={48} value={hours} onChange={(e) => setHours(e.target.value)} />
              <Button onClick={saveHours} disabled={savingHours}>{savingHours ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button>
            </div>
            <p className="text-xs text-muted-foreground">Depois desse prazo sem cadastro, o pedido é cancelado e a peça volta para o estoque.</p>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
