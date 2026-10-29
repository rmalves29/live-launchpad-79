import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
  mode: 'contacts' | 'movements';
}

interface Summary { total: number; no_grupo?: number; saiu?: number; nao_verificado?: number; sem_numero?: number }

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export default function ExportContactsDialog({ open, onOpenChange, tenantId, mode }: Props) {
  const [groups, setGroups] = useState<{ id: string; group_name: string }[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState('todos');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [groupErrors, setGroupErrors] = useState<{ grupo: string; erro: string }[]>([]);
  const [csv, setCsv] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !tenantId) return;
    setSummary(null); setCsv(null); setError(null); setGroupErrors([]);
    supabase.from('fe_groups').select('id, group_name').eq('tenant_id', tenantId).order('group_name')
      .then(({ data }) => setGroups(data || []));
    supabase.from('fe_campaigns').select('id, name').eq('tenant_id', tenantId).order('name')
      .then(({ data }) => setCampaigns(data || []));
  }, [open, tenantId]);

  const filename = mode === 'contacts' ? `contatos-grupos-${today()}.csv` : `movimentacao-grupos-${today()}.csv`;

  const generate = async () => {
    setLoading(true); setError(null); setSummary(null); setCsv(null); setGroupErrors([]);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('fe-export-contacts', {
        body: {
          tenant_id: tenantId, mode, status, group_ids: groupIds,
          campaign_id: campaignId === 'all' ? undefined : campaignId,
          date_from: dateFrom || undefined, date_to: dateTo || undefined,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.success) throw new Error(data?.error || 'Falha ao exportar');
      setSummary(data.summary); setCsv(data.csv); setGroupErrors(data.grupos_com_erro || []);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (id: string) =>
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{mode === 'contacts' ? 'Exportar contatos dos grupos' : 'Exportar movimentação'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto pr-1">
          {mode === 'contacts' && (
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="no_grupo">No grupo</SelectItem>
                  <SelectItem value="saiu">Saiu</SelectItem>
                  <SelectItem value="nao_verificado">Não verificado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Campanha</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>De</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label>Até</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          </div>
          <div className="space-y-1">
            <Label>Grupos {groupIds.length ? `(${groupIds.length})` : '(todos)'}</Label>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2 space-y-1">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={groupIds.includes(g.id)} onCheckedChange={() => toggleGroup(g.id)} />
                  {g.group_name}
                </label>
              ))}
              {!groups.length && <p className="text-xs text-muted-foreground">Nenhum grupo.</p>}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {summary && (
            <div className="rounded-md border border-border p-3 text-sm space-y-1">
              <p><strong>Total:</strong> {summary.total}</p>
              {mode === 'contacts' && (
                <>
                  <p>No grupo: {summary.no_grupo} · Saiu: {summary.saiu} · Sem número: {summary.sem_numero}</p>
                  <p>Não verificado: {summary.nao_verificado ?? 0}</p>
                  {groupErrors.length > 0 && (
                    <p className="text-destructive">Grupos com erro: {groupErrors.map((g) => `${g.grupo} (${g.erro})`).join(', ')}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {csv ? (
            <Button onClick={() => downloadCsv(csv, filename)}><Download className="mr-1 h-4 w-4" /> Baixar CSV</Button>
          ) : (
            <Button onClick={generate} disabled={loading}>
              {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Gerar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
