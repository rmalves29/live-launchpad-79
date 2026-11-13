/**
 * Olist ERP (API v3): conexão da conta (OAuth 2) e saúde do token.
 * O client_secret e os tokens nunca voltam para o navegador: tudo passa pela função olist-oauth, que devolve só o status.
 * Esta fase cobre conexão e renovação automática do token (a cada 2 horas). Produtos, estoque e pedidos vêm nas próximas fases.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, RefreshCw, ExternalLink, AlertTriangle, CheckCircle2, Unplug } from 'lucide-react';

// Mesmo endereço fixo do cliente Supabase do app (VITE_SUPABASE_URL não existe na compilação publicada e virava "undefined").
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';

type OlistStatus = {
  status: 'sem_credenciais' | 'aguardando_autorizacao' | 'ativa' | 'erro' | 'reautorizar';
  is_active?: boolean;
  has_credentials: boolean;
  client_id?: string;
  secret_saved?: boolean;
  authorized?: boolean;
  authorized_at?: string | null;
  token_expires_at?: string | null;
  last_refresh_at?: string | null;
  next_refresh_at?: string | null;
  refresh_failures?: number;
  last_error?: string | null;
  needs_reauth?: boolean;
};

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_LABEL: Record<OlistStatus['status'], { text: string; className: string }> = {
  sem_credenciais: { text: 'Não configurado', className: 'bg-muted text-muted-foreground' },
  aguardando_autorizacao: { text: 'Aguardando autorização', className: 'bg-amber-500 text-white hover:bg-amber-500' },
  ativa: { text: 'Conectado', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  erro: { text: 'Erro ao renovar (tentando de novo)', className: 'bg-amber-500 text-white hover:bg-amber-500' },
  reautorizar: { text: 'Reautorização necessária', className: 'bg-destructive text-destructive-foreground hover:bg-destructive' },
};

export default function OlistIntegration({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function call(body: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.functions.invoke('olist-oauth', { body: { tenant_id: tenantId, ...body } });
    if (error) throw new Error((data as any)?.error || error.message || 'Erro ao falar com o servidor');
    return data;
  }

  const { data: st, isLoading, refetch } = useQuery<OlistStatus>({
    queryKey: ['olist-status-v3', tenantId],
    queryFn: async () => (await call({ action: 'status' })) as OlistStatus,
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });

  useEffect(() => { if (st?.client_id) setClientId(st.client_id); }, [st?.client_id]);

  // volta do login na Olist
  useEffect(() => {
    const r = searchParams.get('olist');
    if (!r) return;
    if (r === 'success') toast.success('Olist ERP autorizado! O token será renovado automaticamente.');
    else toast.error(`Não foi possível autorizar a Olist: ${searchParams.get('reason') || 'erro desconhecido'}`);
    const next = new URLSearchParams(searchParams);
    next.delete('olist'); next.delete('reason');
    setSearchParams(next, { replace: true });
    queryClient.invalidateQueries({ queryKey: ['olist-status-v3', tenantId] });
  }, [searchParams, setSearchParams, queryClient, tenantId]);

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try { await fn(); } catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setBusy(null); }
  }

  const save = () => run('save', async () => {
    const r = await call({ action: 'save_credentials', client_id: clientId, client_secret: clientSecret });
    if (!r.success) throw new Error(r.error || 'Não foi possível salvar');
    setClientSecret('');
    toast.success('Credenciais salvas. Agora clique em Autorizar na Olist.');
    await refetch();
  });

  const authorize = () => run('authorize', async () => {
    const r = await call({ action: 'authorize' });
    if (!r.success || !r.authorization_url) throw new Error(r.error || 'Não foi possível gerar o link');
    window.location.href = r.authorization_url;
  });

  const refreshNow = () => run('refresh', async () => {
    const r = await call({ action: 'refresh_now' });
    if (r.success) toast.success('Token renovado.');
    else toast.error(r.error || 'A Olist não renovou o token');
    await refetch();
  });

  const disconnect = () => run('disconnect', async () => {
    if (!window.confirm('Desconectar a Olist? As credenciais ficam salvas, mas será preciso autorizar de novo.')) return;
    await call({ action: 'disconnect' });
    toast.success('Olist desconectada.');
    await refetch();
  });

  const s = st?.status || 'sem_credenciais';
  const label = STATUS_LABEL[s];
  const callbackUrl = `${SUPABASE_URL}/functions/v1/olist-oauth-callback`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Olist ERP</CardTitle>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Badge className={label.className}>{label.text}</Badge>}
          </div>
          <CardDescription>
            Conecte a conta Olist (antigo Tiny) para sincronizar produtos, estoque e pedidos. Nesta etapa você conecta a conta e o Cartzy mantém o acesso
            renovado sozinho, sem precisar entrar de novo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {st?.needs_reauth && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                A Olist recusou a renovação do acesso{st.last_error ? ` (${st.last_error})` : ''}. Clique em <b>Autorizar na Olist</b> para entrar de novo.
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-md border p-3 text-sm space-y-1">
            <p className="font-medium">1. Crie o aplicativo no ERP da Olist</p>
            <p className="text-muted-foreground">
              No ERP: Configurações → Aplicativos (API v3). Em <b>URL de redirecionamento</b> cole o endereço abaixo e marque só as permissões necessárias
              (leitura de pedidos, produtos e estoque; escrita só quando as próximas etapas forem ativadas).
            </p>
            <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{callbackUrl}</code>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="olist_client_id">Client ID</Label>
              <Input id="olist_client_id" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" placeholder="tiny-api-..." />
            </div>
            <div className="space-y-1">
              <Label htmlFor="olist_client_secret">Client Secret</Label>
              <Input
                id="olist_client_secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password"
                placeholder={st?.secret_saved ? 'Salvo (deixe em branco para manter)' : 'Cole o Client Secret'}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={!!busy || !clientId.trim() || (!st?.secret_saved && !clientSecret.trim())}>
              {busy === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}2. Salvar credenciais
            </Button>
            <Button variant="secondary" onClick={authorize} disabled={!!busy || !st?.has_credentials}>
              {busy === 'authorize' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              3. {st?.authorized ? 'Autorizar de novo na Olist' : 'Autorizar na Olist'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {st?.authorized && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4" /> Acesso e renovação do token</CardTitle>
            <CardDescription>O acesso dura 4 horas e a renovação dura 1 dia. O Cartzy renova a cada 2 horas, automaticamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Autorizado em</dt><dd>{fmt(st.authorized_at)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Acesso válido até</dt><dd>{fmt(st.token_expires_at)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Última renovação</dt><dd>{fmt(st.last_refresh_at)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Próxima renovação</dt><dd>{st.is_active ? fmt(st.next_refresh_at) : '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Falhas seguidas</dt><dd>{st.refresh_failures ?? 0}</dd></div>
            </dl>
            {st.last_error && !st.needs_reauth && (
              <p className="text-sm text-amber-600">Última tentativa falhou: {st.last_error}. O Cartzy tenta de novo sozinho.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={refreshNow} disabled={!!busy}>
                {busy === 'refresh' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Renovar agora
              </Button>
              <Button variant="ghost" size="sm" onClick={disconnect} disabled={!!busy}>
                <Unplug className="mr-2 h-4 w-4" />Desconectar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
