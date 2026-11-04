import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Link2, Loader2, RefreshCw, Save, StickyNote, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { LEAD_STATUS, LEAD_STATUS_ORDER } from './lead-status';

const TZ = { timeZone: 'America/Sao_Paulo' } as const;
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { ...TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ALL = '__all__';
/** datetime-local (Brasília) → ISO com -03:00 */
const brtToIso = (v: string) => (v ? new Date(`${v}:00-03:00`).toISOString() : '');

async function invoke(body: any) {
  const { data, error } = await supabase.functions.invoke('affiliate-booking', { body });
  if (error) return { success: false, error: error.message };
  return data;
}

export function AdminLeadsTab({ affiliates }: { affiliates: { id: string; nome: string }[] }) {
  const { confirm, confirmDialogElement } = useConfirmDialog();
  const [leads, setLeads] = useState<any[]>([]);
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [agenda, setAgenda] = useState<any>(null);
  const [google, setGoogle] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [fAff, setFAff] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [notesFor, setNotesFor] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [resFor, setResFor] = useState<any>(null);
  const [resAt, setResAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingAgenda, setSavingAgenda] = useState(false);
  const [linkFor, setLinkFor] = useState<any>(null);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [tSearch, setTSearch] = useState('');
  const [tPick, setTPick] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [l, u, s, g] = await Promise.all([
      supabase.from('platform_affiliate_leads' as any).select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('platform_unmatched_payments' as any).select('*').eq('status', 'pendente').order('paid_at', { ascending: false }),
      supabase.from('platform_affiliate_settings' as any).select('agenda').eq('id', 1).maybeSingle(),
      invoke({ action: 'google_status' }),
    ]);
    setLeads((l.data as any) || []); setUnmatched((u.data as any) || []);
    setAgenda((s.data as any)?.agenda ?? null); setGoogle(g?.success ? !!g.connected : null);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const affName = useMemo(() => Object.fromEntries(affiliates.map((a) => [a.id, a.nome])), [affiliates]);
  const filtered = useMemo(() => leads.filter((l) =>
    (fAff === ALL || (fAff === 'none' ? !l.affiliate_id : l.affiliate_id === fAff)) && (fStatus === ALL || l.status === fStatus)), [leads, fAff, fStatus]);
  const googleIssues = leads.filter((l) => l.status === 'reuniao_agendada' && l.google_error).length;

  const setStatus = async (l: any, status: string) => {
    const { error } = await supabase.from('platform_affiliate_leads' as any).update({ status }).eq('id', l.id);
    if (error) toast.error(error.message); else { toast.success(`${l.empresa || l.nome}: ${LEAD_STATUS[status]}`); load(); }
  };

  const saveNotes = async () => {
    setBusy(true);
    const { error } = await supabase.from('platform_affiliate_leads' as any).update({ notas: notes || null }).eq('id', notesFor.id);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success('Notas salvas'); setNotesFor(null); load(); }
  };

  const reschedule = async () => {
    setBusy(true);
    const r = await invoke({ action: 'admin_reschedule', lead_id: resFor.id, meeting_at: brtToIso(resAt) });
    setBusy(false);
    if (!r?.success) return toast.error(r?.error || 'Erro ao reagendar');
    toast.success(r.google_error ? `Reagendado (Google: ${r.google_error})` : 'Reunião reagendada');
    setResFor(null); load();
  };

  const cancelMeeting = async (l: any) => {
    if (!(await confirm({ title: `Cancelar reunião de ${l.empresa || l.nome}?`, description: 'O evento sai do Google Agenda e a pessoa recebe um aviso no WhatsApp.' }))) return;
    const r = await invoke({ action: 'admin_cancel', lead_id: l.id });
    if (!r?.success) toast.error(r?.error || 'Erro ao cancelar'); else { toast.success('Reunião cancelada'); load(); }
  };

  const retryGoogle = async (l: any) => {
    const r = await invoke({ action: 'admin_retry_google', lead_id: l.id });
    if (!r?.success) toast.error(r?.error || 'Erro no Google'); else { toast.success('Evento criado no Google Agenda'); load(); }
  };

  const saveAgenda = async () => {
    setSavingAgenda(true);
    const a = { ...agenda, antecedencia_min: Number(agenda.antecedencia_min) || 0, dias_frente: Number(agenda.dias_frente) || 14, duracao: 30, tz: 'America/Sao_Paulo' };
    const { error } = await supabase.from('platform_affiliate_settings' as any).update({ agenda: a, updated_at: new Date().toISOString() }).eq('id', 1);
    setSavingAgenda(false);
    if (error) toast.error(error.message); else { toast.success('Agenda salva'); load(); }
  };

  const openLink = async (p: any) => {
    setLinkFor(p); setTPick(null); setTSearch('');
    if (tenants.length === 0) {
      const { data } = await supabase.from('tenants').select('id, name').order('name');
      setTenants((data as any) || []);
    }
  };
  const doLink = async () => {
    if (!tPick) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('platform_link_unmatched_payment' as any, { _unmatched_id: linkFor.id, _tenant_id: tPick });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Vinculado: ${(data as any)?.pagamentos} pagamento(s), ${(data as any)?.comissoes} comissão(ões) gerada(s)`);
    setLinkFor(null); load();
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="space-y-5">
      {confirmDialogElement}
      {google === false && (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Google Agenda não conectado: as reuniões são salvas, mas sem evento nem link do Meet.</AlertDescription></Alert>
      )}
      {google && googleIssues > 0 && (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{googleIssues} reunião(ões) sem evento no Google. Use "Tentar Google" no card.</AlertDescription></Alert>
      )}

      {agenda && (
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Agenda de reuniões (Brasília, 30 min)</div>
            <Badge variant={google ? 'default' : 'secondary'}>Google Agenda: {google ? 'conectado' : google === false ? 'não conectado' : '—'}</Badge>
          </div>
          <div className="flex flex-wrap gap-3">
            {WEEK.map((w, i) => (
              <label key={w} className="flex items-center gap-1.5 text-sm">
                <Checkbox checked={(agenda.dias || []).includes(i)} onCheckedChange={(v) => setAgenda({ ...agenda, dias: v ? [...(agenda.dias || []), i].sort() : (agenda.dias || []).filter((d: number) => d !== i) })} />{w}
              </label>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-5 items-end">
            <div><Label>Início</Label><Input type="time" value={agenda.inicio} onChange={(e) => setAgenda({ ...agenda, inicio: e.target.value })} /></div>
            <div><Label>Fim</Label><Input type="time" value={agenda.fim} onChange={(e) => setAgenda({ ...agenda, fim: e.target.value })} /></div>
            <div><Label>Antecedência mínima (min)</Label><Input value={agenda.antecedencia_min} onChange={(e) => setAgenda({ ...agenda, antecedencia_min: e.target.value })} /></div>
            <div><Label>Dias à frente</Label><Input value={agenda.dias_frente} onChange={(e) => setAgenda({ ...agenda, dias_frente: e.target.value })} /></div>
            <Button onClick={saveAgenda} disabled={savingAgenda}>{savingAgenda ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}{savingAgenda ? 'Salvando...' : 'Salvar agenda'}</Button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-56"><Label>Afiliada</Label>
          <Select value={fAff} onValueChange={setFAff}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Todas</SelectItem><SelectItem value="none">Sem afiliada</SelectItem>
              {affiliates.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select></div>
        <div className="w-48"><Label>Status</Label>
          <Select value={fStatus} onValueChange={setFStatus}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Todos</SelectItem>{LEAD_STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{LEAD_STATUS[s]}</SelectItem>)}</SelectContent></Select></div>
        <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Atualizar</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {LEAD_STATUS_ORDER.map((st) => {
          const col = filtered.filter((l) => l.status === st);
          return (
            <div key={st} className="rounded-xl border bg-muted/30 p-2 space-y-2 min-h-[120px]">
              <div className="px-1 text-sm font-semibold flex justify-between"><span>{LEAD_STATUS[st]}</span><span className="text-muted-foreground">{col.length}</span></div>
              {col.map((l) => (
                <div key={l.id} className="rounded-lg border bg-card p-2.5 text-xs space-y-1.5">
                  <div className="text-sm font-medium leading-tight">{l.empresa || l.nome}</div>
                  {l.empresa && <div className="text-muted-foreground">{l.nome}</div>}
                  <div className="text-muted-foreground">{l.whatsapp || '-'}{l.instagram ? ` · @${l.instagram}` : ''}</div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{l.affiliate_id ? affName[l.affiliate_id] || 'afiliada' : 'sem afiliada'}</Badge>
                    <Badge variant="secondary">{l.origem}</Badge>
                    {l.vende_live != null && <Badge variant="secondary">{l.vende_live ? 'vende em live' : 'não vende em live'}</Badge>}
                  </div>
                  {l.meeting_at && <div className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{fmt(l.meeting_at)}</div>}
                  {l.meeting_link && <a href={l.meeting_link} target="_blank" rel="noreferrer" className="text-primary underline break-all">{l.meeting_link}</a>}
                  {l.google_error && l.status === 'reuniao_agendada' && <div className="text-destructive">{l.google_error}</div>}
                  {l.notas && <div className="whitespace-pre-wrap rounded bg-muted p-1.5">{l.notas}</div>}
                  <Select value={l.status} onValueChange={(v) => setStatus(l, v)}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{LEAD_STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{LEAD_STATUS[s]}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setNotesFor(l); setNotes(l.notas || ''); }}><StickyNote className="h-3.5 w-3.5 mr-1" />Notas</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setResFor(l); setResAt(''); }}><CalendarClock className="h-3.5 w-3.5 mr-1" />{l.meeting_at ? 'Reagendar' : 'Agendar'}</Button>
                    {l.status === 'reuniao_agendada' && <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => cancelMeeting(l)}><XCircle className="h-3.5 w-3.5 mr-1" />Cancelar</Button>}
                    {l.status === 'reuniao_agendada' && l.google_error && google && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => retryGoogle(l)}><RefreshCw className="h-3.5 w-3.5 mr-1" />Tentar Google</Button>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border bg-card p-4">
        <div className="font-semibold mb-2">Pagamentos sem empresa vinculada</div>
        {unmatched.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr>{['Data', 'Pagador', 'Contato', 'Documento', 'Valor', ''].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{unmatched.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.paid_at ? new Date(p.paid_at).toLocaleDateString('pt-BR', TZ) : '-'}</td>
                <td className="p-2">{p.customer_name || '-'}</td>
                <td className="p-2">{p.customer_email || '-'}<div className="text-muted-foreground">{p.customer_phone || ''}</div></td>
                <td className="p-2">{p.customer_document || '-'}</td>
                <td className="p-2">{brl(p.amount)}</td>
                <td className="p-2"><Button size="sm" onClick={() => openLink(p)}><Link2 className="h-4 w-4 mr-1" />Vincular a empresa</Button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <Dialog open={!!notesFor} onOpenChange={(o) => !o && setNotesFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Notas · {notesFor?.empresa || notesFor?.nome}</DialogTitle></DialogHeader>
          <Textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setNotesFor(null)}>Cancelar</Button><Button onClick={saveNotes} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resFor} onOpenChange={(o) => !o && setResFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{resFor?.meeting_at ? 'Reagendar' : 'Agendar'} reunião · {resFor?.empresa || resFor?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {resFor?.meeting_at && <p className="text-sm text-muted-foreground">Atual: {fmt(resFor.meeting_at)}</p>}
            <Label>Novo dia e horário (Brasília)</Label>
            <Input type="datetime-local" step={1800} value={resAt} onChange={(e) => setResAt(e.target.value)} />
            <p className="text-xs text-muted-foreground">A pessoa recebe o novo horário no WhatsApp e o Google Agenda é atualizado.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setResFor(null)}>Cancelar</Button><Button onClick={reschedule} disabled={busy || !resAt}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkFor} onOpenChange={(o) => !o && setLinkFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vincular pagamento a uma empresa</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>{linkFor?.customer_name} · {linkFor?.customer_email} · {brl(linkFor?.amount)}</p>
            <p className="text-muted-foreground">Os próximos pagamentos desse cliente entram sozinhos, e as comissões deste e dos outros pagamentos pendentes dele são geradas agora.</p>
            <Input placeholder="Buscar empresa" value={tSearch} onChange={(e) => setTSearch(e.target.value)} />
            <div className="max-h-60 overflow-y-auto rounded border">
              {tenants.filter((t) => t.name?.toLowerCase().includes(tSearch.toLowerCase())).slice(0, 100).map((t) => (
                <button key={t.id} type="button" onClick={() => setTPick(t.id)} className={`block w-full px-3 py-1.5 text-left hover:bg-muted ${tPick === t.id ? 'bg-primary/10 font-medium' : ''}`}>{t.name}</button>
              ))}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLinkFor(null)}>Cancelar</Button><Button onClick={doLink} disabled={busy || !tPick}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Vincular'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
