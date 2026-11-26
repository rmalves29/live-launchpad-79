// Sorteio entre quem está nos grupos de WhatsApp da loja (função sorteio-grupos).
// 1) "Atualizar participantes" lê os grupos um a um no WhatsApp (grupos grandes demoram).
// 2) "Sortear" usa as leituras de até 30 min + quem entrou/saiu depois. Nada é enviado aos grupos.
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Trophy, Users, AlertTriangle, History, RefreshCw } from 'lucide-react';
import { formatPhoneForDisplay } from '@/lib/phone-utils';

// Lojas com o sorteio por grupos liberado (mesma lista da função sorteio-grupos)
export const GROUP_RAFFLE_TENANTS = ['b22bb1e6-e9a1-4469-aa4e-57ab13f29321']; // FL Semi Joias

const MAX_AGE_MIN = 30;
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const ageMin = (iso?: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 60000 : Infinity);

type Group = { id: string; name: string; participants: number | null; read_at: string | null; status: string | null; error: string | null; read_count: number | null };
type Winner = { phone: string; name: string; whatsapp_name?: string | null; image?: string | null; groups: string[] };
type Fora = { grupo: string; motivo: string };
type DrawResult = { winners: Winner[]; participants_count: number; groups_count: number; excluded_admins: number; no_phone_count: number; grupos_fora: Fora[]; created_at: string };
type HistoryRow = { id: string; created_at: string; groups_count: number; participants_count: number; winners: Winner[] };

function GroupStatus({ g, busy }: { g: Group; busy: boolean }) {
  if (busy) return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />lendo…</span>;
  if (g.status === 'not_found') return <Badge variant="destructive" className="text-[10px]">não existe mais</Badge>;
  if (!g.read_at) return <Badge variant="outline" className="text-[10px]">{g.status === 'error' ? 'erro na leitura' : 'não lido'}</Badge>;
  const fresh = ageMin(g.read_at) <= MAX_AGE_MIN;
  return (
    <Badge variant={fresh ? 'secondary' : 'outline'} className="text-[10px]" title={g.error || undefined}>
      {g.read_count} · {fmtTime(g.read_at)}{fresh ? '' : ' (antiga)'}{g.error ? ' ⚠' : ''}
    </Badge>
  );
}

function Avatar({ w }: { w: Winner }) {
  const [broken, setBroken] = useState(false);
  const initial = (w.name || w.whatsapp_name || '?').trim().charAt(0).toUpperCase();
  if (w.image && !broken) return <img src={w.image} alt="" className="h-28 w-28 shrink-0 rounded-full object-cover border-2 border-primary/30" onError={() => setBroken(true)} />;
  return <div className="h-28 w-28 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center text-5xl font-bold">{initial}</div>;
}

export default function GroupRaffle({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);
  const [winnersCount, setWinnersCount] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [pendingFora, setPendingFora] = useState<Fora[] | null>(null);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [alreadyWon, setAlreadyWon] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('sorteio-grupos', { body: { tenant_id: tenantId, ...body } });
    if (error) {
      let msg = error.message;
      try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* mantém */ }
      throw new Error(msg);
    }
    return data;
  };

  const loadGroups = async (keepSelection = false) => {
    const d = await call({ action: 'groups' });
    if (!d?.success) throw new Error(d?.error || 'Falha ao carregar os grupos');
    const list: Group[] = d.groups || [];
    setGroups(list);
    if (!keepSelection) setSelected(new Set(list.filter((g) => g.status !== 'not_found').map((g) => g.id)));
  };
  const loadHistory = async () => {
    try { const d = await call({ action: 'history' }); if (d?.success) setHistory(d.history || []); } catch { /* opcional */ }
  };

  useEffect(() => {
    (async () => {
      setLoadingGroups(true);
      try { await loadGroups(); } catch (e: any) { toast({ title: 'Não foi possível carregar os grupos', description: e.message, variant: 'destructive' }); }
      finally { setLoadingGroups(false); }
      loadHistory();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const allSelected = groups.length > 0 && selected.size === groups.length;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedGroups = useMemo(() => groups.filter((g) => selected.has(g.id)), [groups, selected]);
  const staleCount = selectedGroups.filter((g) => !(g.status === 'ok' && ageMin(g.read_at) <= MAX_AGE_MIN)).length;

  // Lê os grupos escolhidos no WhatsApp, 2 de cada vez
  const refreshSelected = async (onlyStale: boolean) => {
    const targets = selectedGroups.filter((g) => !onlyStale || !(g.status === 'ok' && ageMin(g.read_at) <= MAX_AGE_MIN));
    if (!targets.length) { toast({ title: 'Os grupos escolhidos já estão atualizados' }); return; }
    stopRef.current = false;
    setProgress({ done: 0, total: targets.length });
    let idx = 0; let done = 0; let failed = 0;
    const worker = async () => {
      while (idx < targets.length && !stopRef.current) {
        const g = targets[idx++];
        setRefreshing((s) => new Set(s).add(g.id));
        try {
          const r = await call({ action: 'refresh_group', group_id: g.id });
          if (!r?.success) failed++;
        } catch { failed++; }
        setRefreshing((s) => { const n = new Set(s); n.delete(g.id); return n; });
        done++;
        setProgress({ done, total: targets.length });
      }
    };
    await Promise.all([worker(), worker()]);
    try { await loadGroups(true); } catch { /* mantém a lista */ }
    setProgress(null);
    toast({ title: stopRef.current ? 'Atualização interrompida' : 'Participantes atualizados', description: failed ? `${failed} grupo(s) não puderam ser lidos.` : undefined });
  };

  const draw = async (allowPartial: boolean, excludeWinners: boolean) => {
    if (!selected.size) { toast({ title: 'Escolha pelo menos um grupo', variant: 'destructive' }); return; }
    setDrawing(true);
    try {
      const d = await call({ action: 'draw', group_ids: Array.from(selected), winners: winnersCount, exclude_phones: excludeWinners ? alreadyWon : [], allow_partial: allowPartial });
      if (d?.needs_confirmation) { setPendingFora(d.grupos_fora || []); return; }
      if (!d?.success) throw new Error(d?.error || 'Falha no sorteio');
      setPendingFora(null);
      setResult(d);
      setAlreadyWon((prev) => Array.from(new Set([...(excludeWinners ? prev : []), ...d.winners.map((w: Winner) => w.phone)])));
      loadHistory();
    } catch (e: any) {
      toast({ title: 'Não foi possível sortear', description: e.message, variant: 'destructive' });
    } finally { setDrawing(false); }
  };

  const busy = !!progress || drawing;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <Card>
        <CardHeader><CardTitle className="text-lg">1. Grupos e participantes</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Participa quem estiver no grupo. Quem saiu não entra, e quem está em mais de um grupo conta uma vez.
            Administradores dos grupos e o número da loja ficam de fora. Nada é enviado aos grupos.
          </p>
          {loadingGroups ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos…</div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum grupo cadastrado no Fluxo de Envio.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox checked={allSelected} disabled={busy} onCheckedChange={(v) => setSelected(v ? new Set(groups.map((g) => g.id)) : new Set())} />
                Todos os grupos ({groups.length})
              </label>
              <ScrollArea className="h-72 rounded-md border p-2">
                <div className="space-y-1">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                      <Checkbox checked={selected.has(g.id)} disabled={busy} onCheckedChange={() => toggle(g.id)} />
                      <span className="flex-1 truncate" title={g.name}>{g.name}</span>
                      <GroupStatus g={g} busy={refreshing.has(g.id)} />
                    </label>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                {selected.size} grupo(s) escolhido(s) · {staleCount > 0 ? `${staleCount} precisa(m) ser atualizado(s)` : 'todos atualizados'}.
                O número mostra quantas pessoas foram lidas e a hora da leitura.
              </p>
              {progress ? (
                <div className="space-y-2">
                  <Progress value={(progress.done / progress.total) * 100} />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Lendo grupos no WhatsApp: {progress.done} de {progress.total}</span>
                    <Button variant="ghost" size="sm" onClick={() => { stopRef.current = true; }}>Parar</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Grupos grandes podem levar até 1 minuto e meio cada.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button variant="outline" onClick={() => refreshSelected(true)} disabled={busy || !selected.size}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Atualizar participantes {staleCount ? `(${staleCount})` : ''}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => refreshSelected(false)} disabled={busy || !selected.size}>Ler de novo todos os escolhidos</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">2. Sorteio</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Quantos ganhadores</label>
            <Input type="number" min={1} max={20} value={winnersCount} disabled={busy} onChange={(e) => setWinnersCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
          </div>
          <Button className="w-full" onClick={() => draw(false, false)} disabled={busy || !selected.size}>
            {drawing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sorteando…</> : <><Trophy className="mr-2 h-4 w-4" /> Sortear</>}
          </Button>

          {pendingFora && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
              <div className="flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3" /> {pendingFora.length} grupo(s) ficariam de fora:</div>
              <ul className="list-disc pl-4 max-h-32 overflow-auto">{pendingFora.map((g) => <li key={g.grupo}>{g.grupo} — {g.motivo}</li>)}</ul>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setPendingFora(null); refreshSelected(true); }} disabled={busy}>Atualizar esses grupos</Button>
                <Button size="sm" onClick={() => draw(true, false)} disabled={busy}>Sortear mesmo assim</Button>
              </div>
            </div>
          )}

          {result && (
            <>
              <div className="space-y-3">
                {result.winners.map((w, i) => (
                  <div key={w.phone} className="rounded-xl border-2 border-primary/30 p-5 bg-primary/5 flex gap-5 items-center">
                    <Avatar w={w} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-base font-semibold text-primary"><Trophy className="h-5 w-5" /> {i + 1}º ganhador</div>
                      <div className="text-3xl font-bold leading-tight break-words">{w.name || w.whatsapp_name || 'Sem nome'}</div>
                      {w.whatsapp_name && w.name && w.whatsapp_name !== w.name && <div className="text-sm text-muted-foreground break-words">WhatsApp: {w.whatsapp_name}</div>}
                      <div className="text-xl font-medium mt-1">{formatPhoneForDisplay(w.phone)}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{w.groups.map((g) => <Badge key={g} variant="secondary" className="text-sm px-2.5 py-0.5">{g}</Badge>)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-sm text-muted-foreground space-y-1.5">
                <div className="flex items-center gap-1.5"><Users className="h-4 w-4" /> {result.participants_count} participantes concorreram, de {result.groups_count} grupo(s)</div>
                <div>{result.excluded_admins} administrador(es) fora{result.no_phone_count ? ` · ${result.no_phone_count} sem número visível fora` : ''}</div>
                {result.grupos_fora?.length > 0 && <div>{result.grupos_fora.length} grupo(s) ficaram de fora</div>}
                <div>Sorteado em {fmtDateTime(result.created_at)}</div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => draw(true, true)} disabled={busy}>Sortear de novo sem quem já ganhou</Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><History className="h-4 w-4" /> Histórico</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum sorteio ainda.</p>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-3">
                {history.map((h) => (
                  <div key={h.id} className="border-b pb-2 text-sm">
                    <div className="text-xs text-muted-foreground">{fmtDateTime(h.created_at)} · {h.participants_count} participantes · {h.groups_count} grupo(s)</div>
                    {(h.winners || []).map((w) => <div key={w.phone}>{w.name || w.whatsapp_name || 'Sem nome'} — {formatPhoneForDisplay(w.phone)}</div>)}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
