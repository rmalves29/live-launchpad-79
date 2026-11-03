import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, RefreshCw, Send, XCircle, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { AffiliateSelect } from '@/components/affiliates/AffiliateSelect';

const SUFFIX_CHARS = ['*', '+', '@', '#', '$', '%'];
const pick = () => {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return SUFFIX_CHARS[b[0] % SUFFIX_CHARS.length];
};
const newSuffix = () => pick() + pick();
const slugFromName = (n: string) =>
  n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').substring(0, 20);

interface Req {
  id: string; short_code: string; status: string; company_name: string; slug: string; admin_email: string;
  contact_name: string | null; contact_phone: string | null; sells_live: boolean; sells_bazar: boolean;
  password_suffix: string; created_at: string; expires_at: string; error_message: string | null;
  welcome_sent_at: string | null; approval_sent_at: string | null;
}

const EMPTY = { company_name: '', admin_email: '', company_email: '', contact_name: '', contact_phone: '', cnpj: '', address: '', notes: '', logo_url: '', sells_live: true, sells_bazar: false };

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('tenant-onboarding', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error(detail?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

const statusVariant = (s: string) =>
  s === 'aprovado' ? 'default' : s === 'pendente' || s === 'processando' ? 'secondary' : s === 'erro' ? 'destructive' : 'outline';

export function OnboardingRequestsDialog({ onTenantCreated }: { onTenantCreated?: () => void }) {
  const { confirm, confirmDialogElement } = useConfirmDialog();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [suffix, setSuffix] = useState(newSuffix);
  const [affiliateId, setAffiliateId] = useState<string | null>(null);
  const [affKey, setAffKey] = useState(0);
  const [approver, setApprover] = useState('');
  const [settingsId, setSettingsId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data, error: e }, { data: st }] = await Promise.all([
      supabase.from('tenant_onboarding_requests' as never).select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('app_settings').select('id, onboarding_approver_phone' as never).limit(1).maybeSingle(),
    ]);
    if (e) setError((e as Error).message);
    setRows(((data as unknown) as Req[]) || []);
    const s = st as unknown as { id: number; onboarding_approver_phone: string | null } | null;
    setSettingsId(s?.id ?? null);
    setApprover(s?.onboarding_approver_phone || '');
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const previewPassword = useMemo(() => `${slugFromName(form.company_name) || 'slug'}${suffix}`, [form.company_name, suffix]);
  const set = (k: keyof typeof EMPTY, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const saveApprover = async () => {
    setError(null); setInfo(null);
    const digits = approver.replace(/\D/g, '');
    const q = settingsId
      ? supabase.from('app_settings').update({ onboarding_approver_phone: digits || null } as never).eq('id', settingsId)
      : supabase.from('app_settings').insert({ onboarding_approver_phone: digits || null } as never);
    const { error: e } = await q;
    if (e) setError(e.message); else { setInfo('Número aprovador salvo.'); load(); }
  };

  const create = async () => {
    setError(null); setInfo(null); setBusy('create');
    try {
      const r = await call({ action: 'create', ...form, password_suffix: suffix, affiliate_id: affiliateId });
      setInfo(r.send_error
        ? `Pré-cadastro ${r.short_code} criado (senha ${r.password}), mas o pedido de aprovação não saiu: ${r.send_error}`
        : `Pré-cadastro ${r.short_code} criado e pedido de aprovação enviado. Senha: ${r.password}`);
      setForm(EMPTY); setSuffix(newSuffix()); setAffiliateId(null); setAffKey((k) => k + 1); load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const act = async (row: Req, action: 'resend' | 'cancel' | 'approve') => {
    if (action === 'approve' && !(await confirm({ title: 'Aprovar pré-cadastro', description: `Criar a empresa ${row.company_name} e enviar as boas-vindas?` }))) return;
    if (action === 'cancel' && !(await confirm({ title: 'Cancelar pré-cadastro', description: `Cancelar o cadastro ${row.short_code}?` }))) return;
    setError(null); setInfo(null); setBusy(row.id + action);
    try {
      const r = await call({ action, id: row.id });
      setInfo(action === 'approve' ? r.message : action === 'resend' ? 'Pedido de aprovação reenviado.' : 'Pré-cadastro cancelado.');
      load();
      if (action === 'approve') onTenantCreated?.();
    } catch (e) { setError((e as Error).message); load(); } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><ClipboardList className="h-4 w-4 mr-2" />Pré-cadastros</Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Pré-cadastros de empresas</DialogTitle>
          <DialogDescription>A empresa só é criada quando o número aprovador responde OK pelo WhatsApp (ou pelo botão Aprovar).</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-6 pb-6 space-y-6">
          {error && <Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription></Alert>}
          {info && <Alert><AlertDescription>{info}</AlertDescription></Alert>}

          <section className="space-y-2">
            <Label>Número aprovador (WhatsApp)</Label>
            {!approver && <p className="text-sm text-destructive">Configure o número aprovador: sem ele, os pré-cadastros ficam pendentes.</p>}
            <div className="flex gap-2">
              <Input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Ex.: 31999999999" />
              <Button variant="secondary" onClick={saveApprover}>Salvar</Button>
            </div>
          </section>

          <section className="space-y-3 border rounded-lg p-4">
            <h3 className="font-semibold">Novo pré-cadastro</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>Nome da empresa *</Label><Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} /></div>
              <div><Label>E-mail do admin (login) *</Label><Input type="email" value={form.admin_email} onChange={(e) => set('admin_email', e.target.value)} /></div>
              <div><Label>E-mail da empresa</Label><Input type="email" value={form.company_email} onChange={(e) => set('company_email', e.target.value)} placeholder="Se vazio, usa o do admin" /></div>
              <div><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} /></div>
              <div><Label>Responsável</Label><Input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} /></div>
              <div><Label>WhatsApp do responsável</Label><Input value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} /></div>
              <div className="md:col-span-2"><AffiliateSelect key={affKey} value={affiliateId} onChange={setAffiliateId} phone={form.contact_phone} /></div>
              <div className="md:col-span-2"><Label>Endereço</Label><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Logo (URL, opcional)</Label><Input value={form.logo_url} onChange={(e) => set('logo_url', e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
              <label className="flex items-center gap-2"><Switch checked={form.sells_live} onCheckedChange={(v) => set('sells_live', v)} />Vende em live (Cartzy/Live)</label>
              <label className="flex items-center gap-2"><Switch checked={form.sells_bazar} onCheckedChange={(v) => set('sells_bazar', v)} />Vende bazar/catálogo (Fluxo de Envio)</label>
            </div>
            <p className="text-sm text-muted-foreground">Plano basic · 33 dias · WhatsApp uazapi · acesso Empresa</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Senha que será usada:</span>
              <code className="px-2 py-1 rounded bg-muted font-mono">{previewPassword}</code>
              <Button size="sm" variant="ghost" onClick={() => setSuffix(newSuffix())}><RefreshCw className="h-3 w-3 mr-1" />Trocar final</Button>
            </div>
            <p className="text-xs text-muted-foreground">Se o endereço da empresa já existir, um número é acrescentado ao nome e a senha final aparece após criar.</p>
            <Button onClick={create} disabled={busy === 'create' || !form.company_name || !form.admin_email}>
              {busy === 'create' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Criar pré-cadastro e pedir aprovação
            </Button>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">Pedidos</h3>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pré-cadastro ainda.</p>
            ) : rows.map((r) => {
              const pending = r.status === 'pendente' && new Date(r.expires_at) > new Date();
              return (
                <div key={r.id} className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{r.short_code}</span>
                      <span className="font-medium">{r.company_name}</span>
                      <Badge variant={statusVariant(pending || r.status !== 'pendente' ? r.status : 'expirado')}>{pending || r.status !== 'pendente' ? r.status : 'expirado'}</Badge>
                    </div>
                    <div className="text-muted-foreground">{r.admin_email} · {r.contact_name || '-'} {r.contact_phone || ''} · Live: {r.sells_live ? 'Sim' : 'Não'} | Bazar: {r.sells_bazar ? 'Sim' : 'Não'}</div>
                    <div className="text-muted-foreground">Senha: <code className="font-mono">{r.slug}{r.password_suffix}</code> · criado {new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{r.welcome_sent_at ? ' · boas-vindas enviadas' : ''}</div>
                    {r.error_message && <div className="text-destructive">{r.error_message}</div>}
                  </div>
                  {pending && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(r, 'resend')}><Send className="h-3 w-3 mr-1" />Reenviar pedido</Button>
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(r, 'cancel')}><XCircle className="h-3 w-3 mr-1" />Cancelar</Button>
                      <Button size="sm" disabled={!!busy} onClick={() => act(r, 'approve')}>
                        {busy === r.id + 'approve' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}Aprovar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
          <div className="flex justify-end"><Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button></div>
        </div>
        {confirmDialogElement}
      </DialogContent>
    </Dialog>
  );
}
