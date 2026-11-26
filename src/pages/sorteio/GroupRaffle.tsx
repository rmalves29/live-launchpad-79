// Sorteio entre quem está AGORA nos grupos de WhatsApp da loja (função sorteio-grupos).
// Nada é enviado aos grupos: o resultado aparece só aqui e fica no histórico.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Trophy, Users, AlertTriangle, History } from 'lucide-react';
import { formatPhoneForDisplay } from '@/lib/phone-utils';

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Lojas com o sorteio por grupos liberado (mesma lista da função sorteio-grupos)
export const GROUP_RAFFLE_TENANTS = ['b22bb1e6-e9a1-4469-aa4e-57ab13f29321']; // FL Semi Joias

type Group = { id: string; name: string; participants: number | null; is_admin: boolean };
type Winner = { phone: string; name: string; groups: string[] };
type DrawResult = {
  winners: Winner[]; participants_count: number; groups_count: number; groups_requested: number;
  excluded_admins: number; no_phone_count: number; grupos_com_erro: { grupo: string; erro: string }[]; created_at: string;
};
type HistoryRow = { id: string; created_at: string; groups_count: number; participants_count: number; winners: Winner[]; groups_failed: { grupo: string }[] };

export default function GroupRaffle({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [winnersCount, setWinnersCount] = useState(1);
  const [drawing, setDrawing] = useState(false);
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
    if (!data?.success) throw new Error(data?.error || 'Falha no sorteio');
    return data;
  };

  const loadHistory = async () => {
    try { const d = await call({ action: 'history' }); setHistory(d.history || []); } catch { /* histórico é opcional */ }
  };

  useEffect(() => {
    (async () => {
      setLoadingGroups(true);
      try {
        const d = await call({ action: 'groups' });
        setGroups(d.groups || []);
        setSelected(new Set((d.groups || []).map((g: Group) => g.id)));
      } catch (e: any) {
        toast({ title: 'Não foi possível carregar os grupos', description: e.message, variant: 'destructive' });
      } finally { setLoadingGroups(false); }
      loadHistory();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const allSelected = groups.length > 0 && selected.size === groups.length;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const approxParticipants = useMemo(() => groups.filter((g) => selected.has(g.id)).reduce((s, g) => s + (g.participants || 0), 0), [groups, selected]);

  const draw = async (excludeWinners: boolean) => {
    if (!selected.size) { toast({ title: 'Escolha pelo menos um grupo', variant: 'destructive' }); return; }
    setDrawing(true);
    try {
      const exclude = excludeWinners ? alreadyWon : [];
      const d: DrawResult = await call({ action: 'draw', group_ids: Array.from(selected), winners: winnersCount, exclude_phones: exclude });
      setResult(d);
      setAlreadyWon((prev) => Array.from(new Set([...(excludeWinners ? prev : []), ...d.winners.map((w) => w.phone)])));
      loadHistory();
    } catch (e: any) {
      toast({ title: 'Não foi possível sortear', description: e.message, variant: 'destructive' });
    } finally { setDrawing(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <Card>
        <CardHeader><CardTitle className="text-lg">Grupos que participam</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Participa quem estiver no grupo <b>na hora do sorteio</b>. Quem saiu não entra. Quem está em mais de um grupo conta uma vez.
            Administradores dos grupos e o número da loja ficam de fora. Nada é enviado aos grupos.
          </p>
          {loadingGroups ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos…</div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum grupo cadastrado no Fluxo de Envio.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v ? new Set(groups.map((g) => g.id)) : new Set())} />
                Todos os grupos ({groups.length})
              </label>
              <ScrollArea className="h-72 rounded-md border p-2">
                <div className="space-y-1">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                      <Checkbox checked={selected.has(g.id)} onCheckedChange={() => toggle(g.id)} />
                      <span className="flex-1 truncate">{g.name}</span>
                      {g.participants != null && <span className="text-xs text-muted-foreground">{g.participants}</span>}
                    </label>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">{selected.size} grupo(s) · cerca de {approxParticipants} participantes (número exato é conferido na hora)</p>
            </>
          )}
          <div className="space-y-1">
            <label className="text-sm font-medium">Quantos ganhadores</label>
            <Input type="number" min={1} max={20} value={winnersCount} onChange={(e) => setWinnersCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
          </div>
          <Button className="w-full" onClick={() => draw(false)} disabled={drawing || !selected.size}>
            {drawing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lendo os grupos e sorteando…</> : <><Trophy className="mr-2 h-4 w-4" /> Sortear</>}
          </Button>
          {drawing && <p className="text-xs text-muted-foreground">Com muitos grupos isso pode levar até 1 minuto.</p>}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-lg">Resultado</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!result ? (
            <p className="text-sm text-muted-foreground">Escolha os grupos e clique em Sortear.</p>
          ) : (
            <>
              <div className="space-y-3">
                {result.winners.map((w, i) => (
                  <div key={w.phone} className="rounded-lg border p-3 bg-primary/5">
                    <div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /><span className="font-semibold">{i + 1}º ganhador</span></div>
                    <div className="mt-1 text-lg font-bold">{w.name || 'Sem nome no WhatsApp'}</div>
                    <div className="text-sm">{formatPhoneForDisplay(w.phone)}</div>
                    <div className="mt-1 flex flex-wrap gap-1">{w.groups.map((g) => <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>)}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {result.participants_count} participantes concorreram, de {result.groups_count} grupo(s)</div>
                <div>{result.excluded_admins} administrador(es) fora · {result.no_phone_count} participante(s) sem número visível fora</div>
                <div>Sorteado em {fmtDateTime(result.created_at)}</div>
              </div>
              {result.grupos_com_erro.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                  <div className="flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3" /> {result.grupos_com_erro.length} grupo(s) não puderam ser lidos e ficaram de fora:</div>
                  <ul className="list-disc pl-4 mt-1">{result.grupos_com_erro.map((g) => <li key={g.grupo}>{g.grupo}</li>)}</ul>
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => draw(true)} disabled={drawing}>
                Sortear de novo sem quem já ganhou
              </Button>
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
                    {(h.winners || []).map((w) => <div key={w.phone}>{w.name || 'Sem nome'} — {formatPhoneForDisplay(w.phone)}</div>)}
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
