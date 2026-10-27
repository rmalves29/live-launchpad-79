import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarClock, Loader2, Pause, Pencil, Play, RefreshCw, Square, Package, Users } from 'lucide-react';

interface ScheduledJob {
  id: string;
  status: string;
  total_items: number;
  scheduled_at: string | null;
  job_data: any;
}

const TZ = 'America/Sao_Paulo';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'sem data';

// ISO -> campos de data/hora no fuso de Brasília
const toParts = (iso: string | null) => {
  if (!iso) return { date: '', time: '' };
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  return { date: d, time: t };
};

export default function ScheduledSendsList() {
  const { tenant } = useTenant();
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [tasksByJob, setTasksByJob] = useState<Record<string, { products: string[]; groups: string[] }>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScheduledJob | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sending_jobs')
        .select('id, status, total_items, scheduled_at, job_data')
        .eq('tenant_id', tenant.id)
        .eq('job_type', 'sendflow')
        .in('status', ['scheduled', 'paused'])
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      // pausado só entra aqui se foi pausado a partir de um agendamento
      const list = ((data || []) as ScheduledJob[]).filter((j) => j.status === 'scheduled' || j.job_data?.paused_from_schedule);
      setJobs(list);

      if (list.length) {
        const { data: tasks } = await supabase
          .from('sendflow_tasks')
          .select('job_id, product_code, group_name')
          .in('job_id', list.map((j) => j.id))
          .limit(5000);
        const map: Record<string, { products: string[]; groups: string[] }> = {};
        for (const t of (tasks || []) as any[]) {
          const m = (map[t.job_id] ||= { products: [], groups: [] });
          if (t.product_code && !m.products.includes(t.product_code)) m.products.push(t.product_code);
          if (t.group_name && !m.groups.includes(t.group_name)) m.groups.push(t.group_name);
        }
        setTasksByJob(map);
      } else {
        setTasksByJob({});
      }
    } catch (e) {
      console.error('Erro ao carregar agendamentos:', e);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (job: ScheduledJob) => {
    if (!window.confirm(`Cancelar o envio agendado para ${fmt(job.scheduled_at)}?`)) return;
    setBusyId(job.id);
    try {
      const { error } = await supabase
        .from('sending_jobs')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', job.id)
        .in('status', ['scheduled', 'paused']);
      if (error) throw error;
      toast.success('Agendamento cancelado');
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao cancelar');
    } finally {
      setBusyId(null);
    }
  };

  const pause = async (job: ScheduledJob) => {
    setBusyId(job.id);
    try {
      const { error } = await supabase
        .from('sending_jobs')
        .update({
          status: 'paused',
          paused_at: new Date().toISOString(),
          job_data: { ...(job.job_data || {}), paused_from_schedule: true },
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', job.id)
        .eq('status', 'scheduled');
      if (error) throw error;
      toast.success('Agendamento pausado. Ele não será enviado até você retomar.');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao pausar');
    } finally {
      setBusyId(null);
    }
  };

  const resume = async (job: ScheduledJob) => {
    const passed = !job.scheduled_at || new Date(job.scheduled_at) <= new Date();
    if (passed && !window.confirm('O horário agendado já passou. Retomar e enviar agora?')) return;
    setBusyId(job.id);
    try {
      const nowIso = new Date().toISOString();
      const { paused_from_schedule: _drop, ...rest } = job.job_data || {};
      const { error } = await supabase
        .from('sending_jobs')
        .update({
          status: 'scheduled',
          paused_at: null,
          scheduled_at: passed ? nowIso : job.scheduled_at,
          job_data: { ...rest, ...(passed ? { scheduled_at: nowIso } : {}) },
          updated_at: nowIso,
        } as any)
        .eq('id', job.id)
        .eq('status', 'paused');
      if (error) throw error;
      toast.success(passed ? 'Retomado: será enviado em instantes' : 'Agendamento retomado');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao retomar');
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (job: ScheduledJob) => {
    const p = toParts(job.scheduled_at);
    setEditing(job);
    setDate(p.date);
    setTime(p.time);
    setMessage(String(job.job_data?.messageTemplate || ''));
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!date || !time) {
      toast.error('Defina a data e a hora');
      return;
    }
    const iso = `${date}T${time}:00-03:00`;
    if (new Date(iso) <= new Date()) {
      toast.error('A data/hora deve ser no futuro');
      return;
    }
    if (!message.trim()) {
      toast.error('A mensagem não pode ficar vazia');
      return;
    }
    setBusyId(editing.id);
    try {
      const { error } = await supabase
        .from('sending_jobs')
        .update({
          scheduled_at: iso,
          job_data: { ...(editing.job_data || {}), scheduled_at: iso, messageTemplate: message },
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', editing.id)
        .in('status', ['scheduled', 'paused']);
      if (error) throw error;
      toast.success('Agendamento atualizado');
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setBusyId(null);
    }
  };

  if (!jobs.length) return null;

  return (
    <>
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Envios agendados ({jobs.length})</CardTitle>
                <CardDescription>Aguardando o horário para serem enviados. Pausados não saem até você retomar.</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.map((job) => {
            const info = tasksByJob[job.id];
            return (
              <div key={job.id} className="rounded-xl border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium flex items-center gap-2">
                    {fmt(job.scheduled_at)}
                    {job.status === 'paused' && <Badge variant="outline" className="bg-orange-100 text-orange-700">Pausado</Badge>}
                  </div>
                  <div className="flex gap-2">
                    {job.status === 'paused' ? (
                      <Button size="sm" onClick={() => resume(job)} disabled={busyId === job.id}>
                        <Play className="h-4 w-4 mr-1" /> Retomar
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => pause(job)} disabled={busyId === job.id}>
                        <Pause className="h-4 w-4 mr-1" /> Pausar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(job)} disabled={busyId === job.id}>
                      <Pencil className="h-4 w-4 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => cancel(job)} disabled={busyId === job.id}>
                      <Square className="h-4 w-4 mr-1" /> Cancelar
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{job.total_items} mensagens</Badge>
                  {info && (
                    <>
                      <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" />{info.products.length} produto(s): {info.products.slice(0, 8).join(', ')}{info.products.length > 8 ? '…' : ''}</span>
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{info.groups.length} grupo(s)</span>
                    </>
                  )}
                </div>
                {info && info.groups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {info.groups.slice(0, 12).map((g) => (
                      <span key={g} className="rounded-full border bg-background px-2 py-0.5 text-xs">{g}</span>
                    ))}
                    {info.groups.length > 12 && <span className="text-xs text-muted-foreground">+{info.groups.length - 12}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar envio agendado</DialogTitle>
            <DialogDescription>Altere o horário ou a mensagem. Para trocar produtos ou grupos, cancele e agende de novo.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-sched-date">Data</Label>
              <Input id="edit-sched-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-sched-time">Hora</Label>
              <Input id="edit-sched-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-sched-msg">Mensagem</Label>
            <Textarea id="edit-sched-msg" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Fechar</Button>
            <Button onClick={saveEdit} disabled={busyId === editing?.id}>
              {busyId === editing?.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
